import {
  AudioPlayer,
  AudioPlayerStatus,
  AudioResource,
  createAudioPlayer,
  createAudioResource,
  demuxProbe,
  DiscordGatewayAdapterCreator,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  NoSubscriberBehavior,
  VoiceConnection,
  VoiceConnectionStatus,
  StreamType,
} from '@discordjs/voice';
import { Guild, GuildMember, VoiceBasedChannel } from 'discord.js';
import * as play from 'play-dl';
import { search, video_basic_info, stream_from_info, setToken, getFreeClientID } from 'play-dl';
import { SpotifyApi } from '@spotify/web-api-ts-sdk';
import { Logger } from '../utils/logger';
import { CacheService } from './cache.service';
import { DatabaseService } from '../database/database.service';

export interface Track {
  id: string;
  title: string;
  artist: string;
  duration: number;
  url: string;
  thumbnail: string;
  requestedBy: string;
  platform: 'youtube' | 'spotify';
  addedAt: Date;
}

export interface Queue {
  guildId: string;
  tracks: Track[];
  currentTrack: Track | null;
  volume: number;
  loop: 'none' | 'track' | 'queue';
  shuffle: boolean;
  filters: string[];
  isPaused: boolean;
  isPlaying: boolean;
}

export interface MusicFilters {
  bassboost: string;
  nightcore: string;
  vaporwave: string;
  '8d': string;
  karaoke: string;
  flanger: string;
  gate: string;
  haas: string;
  reverse: string;
  surround: string;
  mcompand: string;
  phaser: string;
  tremolo: string;
  vibrato: string;
  reverse2: string;
  treble: string;
  normalizer: string;
  surrounding: string;
}

/**
 * Music Service for handling voice connections and audio playback
 */
export class MusicService {
  private logger: Logger;
  private cache: CacheService;
  private database: DatabaseService;
  private connections: Map<string, VoiceConnection> = new Map();
  private players: Map<string, AudioPlayer> = new Map();
  private queues: Map<string, Queue> = new Map();
  private spotify: SpotifyApi | null = null;

  // Debouncing for database saves to prevent excessive writes
  private saveQueueTimeouts: Map<string, NodeJS.Timeout> = new Map();
  private readonly SAVE_DEBOUNCE_MS = 2000; // 2 seconds debounce

  private readonly filters: MusicFilters = {
    bassboost: 'bass=g=20,dynaudnorm=f=200',
    nightcore: 'aresample=48000,asetrate=48000*1.25',
    vaporwave: 'aresample=48000,asetrate=48000*0.8',
    '8d': 'apulsator=hz=0.09',
    karaoke: 'pan=mono|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1,highpass=f=1000',
    flanger: 'flanger',
    gate: 'agate',
    haas: 'haas',
    reverse: 'areverse',
    surround: 'surround',
    mcompand: 'mcompand',
    phaser: 'aphaser',
    tremolo: 'tremolo',
    vibrato: 'vibrato',
    reverse2: 'areverse',
    treble: 'treble=g=5',
    normalizer: 'dynaudnorm=f=200',
    surrounding: 'surround',
  };

  constructor(cache?: CacheService, database?: DatabaseService) {
    this.logger = new Logger();

    try {
      // Validate and initialize dependencies
      if (cache && typeof cache.get !== 'function') {
        throw new Error('Invalid CacheService provided');
      }
      if (database && typeof database.client !== 'object') {
        throw new Error('Invalid DatabaseService provided');
      }

      this.cache = cache || new CacheService();
      this.database = database || new DatabaseService();

      // Initialize services asynchronously with error handling
      this.initializeServices();

      this.logger.info('✅ MusicService initialized successfully');
    } catch (error) {
      this.logger.error('❌ Failed to initialize MusicService:', error);
      throw error;
    }
  }

  /**
   * Initialize all music services with improved error handling and performance
   */
  private async initializeServices(): Promise<void> {
    try {
      const initPromises = [
        this.initializePlayDl(),
        this.initializeSpotify(),
        this.loadQueuesFromDatabase(),
      ];

      const results = await Promise.allSettled(initPromises);

      // Log initialization results
      const services = ['PlayDl', 'Spotify', 'Database Queues'];
      results.forEach((result, index) => {
        if (result.status === 'rejected') {
          this.logger.error(`Failed to initialize ${services[index]}:`, result.reason);
        } else {
          this.logger.debug(`✅ ${services[index]} initialized successfully`);
        }
      });

      // Set up cleanup intervals to prevent memory leaks
      this.setupCleanupIntervals();
    } catch (error) {
      this.logger.error('Error during service initialization:', error);
    }
  }

  /**
   * Setup cleanup intervals to prevent memory leaks
   */
  private setupCleanupIntervals(): void {
    // Clean up inactive connections every 5 minutes
    setInterval(
      () => {
        this.cleanupInactiveConnections();
      },
      5 * 60 * 1000
    );

    // Clean up old queue data every 30 minutes
    setInterval(
      () => {
        this.cleanupOldQueues();
      },
      30 * 60 * 1000
    );

    // Clean up cache every hour
    setInterval(
      () => {
        this.cleanupCache();
      },
      60 * 60 * 1000
    );
  }

  /**
   * Clean up inactive voice connections
   */
  private cleanupInactiveConnections(): void {
    try {
      const now = Date.now();
      const inactiveThreshold = 10 * 60 * 1000; // 10 minutes

      for (const [guildId, connection] of this.connections.entries()) {
        if (
          connection.state.status === VoiceConnectionStatus.Destroyed ||
          connection.state.status === VoiceConnectionStatus.Disconnected
        ) {
          this.logger.debug(`Cleaning up inactive connection for guild ${guildId}`);
          this.cleanup(guildId);
        }
      }
    } catch (error) {
      this.logger.error('Error during connection cleanup:', error);
    }
  }

  /**
   * Clean up old queue data
   */
  private cleanupOldQueues(): void {
    try {
      const now = Date.now();
      const oldThreshold = 24 * 60 * 60 * 1000; // 24 hours

      for (const [guildId, queue] of this.queues.entries()) {
        if (!queue.isPlaying && queue.tracks.length === 0) {
          const lastActivity = queue.tracks[queue.tracks.length - 1]?.addedAt?.getTime() || 0;
          if (now - lastActivity > oldThreshold) {
            this.logger.debug(`Cleaning up old queue for guild ${guildId}`);
            this.queues.delete(guildId);
          }
        }
      }
    } catch (error) {
      this.logger.error('Error during queue cleanup:', error);
    }
  }

  /**
   * Clean up cache entries
   */
  private cleanupCache(): void {
    try {
      const now = Date.now();
      let cleanedStreams = 0;
      let cleanedActive = 0;

      // Clean expired stream cache entries
      for (const [key, value] of this.streamCache.entries()) {
        if (value.expires < now) {
          this.streamCache.delete(key);
          cleanedStreams++;
        }
      }

      // Check for potentially stale active streams (older than 5 minutes)
      const staleThreshold = now - 5 * 60 * 1000;
      for (const [key, promise] of this.activeStreams.entries()) {
        // If promise is resolved or rejected, we can remove it
        Promise.resolve(promise)
          .then(() => {
            if (this.activeStreams.get(key) === promise) {
              this.activeStreams.delete(key);
              cleanedActive++;
            }
          })
          .catch(() => {
            if (this.activeStreams.get(key) === promise) {
              this.activeStreams.delete(key);
              cleanedActive++;
            }
          });
      }

      // Clean general cache if available
      if (this.cache && typeof this.cache.cleanup === 'function') {
        this.cache.cleanup();
      }

      this.logger.debug(
        `Cache cleanup completed - Streams: ${cleanedStreams}, Active: ${cleanedActive}`
      );
    } catch (error) {
      this.logger.error('Error during cache cleanup:', error);
    }
  }

  /**
   * Initialize play-dl
   */
  private async initializePlayDl(): Promise<void> {
    try {
      this.logger.debug('🎵 Initializing play-dl...');

      // Validate play-dl availability
      if (!play || typeof play.search !== 'function') {
        throw new Error('play-dl module is not properly installed or imported');
      }

      // Try to get a free client ID for YouTube access with timeout
      const timeoutPromise = new Promise<string | null>((_, reject) => {
        setTimeout(() => reject(new Error('getFreeClientID timeout')), 10000);
      });

      const clientID = await Promise.race([getFreeClientID(), timeoutPromise]).catch(() => null);

      if (clientID) {
        await setToken({
          youtube: {
            cookie: process.env.YOUTUBE_COOKIE || '',
          },
        });
        this.logger.info('✅ Play-dl initialized with cookie configuration');
      } else {
        this.logger.warn(
          '⚠️ Could not get free client ID for play-dl, some features may be limited'
        );
      }

      // Test play-dl functionality
      await this.testPlayDlFunctionality();
    } catch (error) {
      this.logger.warn('⚠️ Play-dl initialization failed, continuing without token:', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  /**
   * Test play-dl functionality
   */
  private async testPlayDlFunctionality(): Promise<void> {
    try {
      const testResults = await search('test music', { limit: 1 });
      if (!testResults || testResults.length === 0) {
        throw new Error('No search results returned');
      }
      this.logger.debug('✅ Play-dl functionality test passed');
    } catch (error) {
      this.logger.warn('⚠️ Play-dl functionality test failed:', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
    }
  }

  /**
   * Initialize Spotify API
   */
  private async initializeSpotify(): Promise<void> {
    try {
      const clientId = process.env.SPOTIFY_CLIENT_ID;
      const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;

      if (
        !clientId ||
        !clientSecret ||
        clientId.includes('your_spotify') ||
        clientSecret.includes('your_spotify')
      ) {
        this.logger.warn('🎵 Spotify credentials not found - running in YouTube-only mode');
        this.spotify = null;
        return;
      }

      // Validate credentials format
      if (typeof clientId !== 'string' || clientId.length < 10) {
        throw new Error('Invalid Spotify client ID format');
      }
      if (typeof clientSecret !== 'string' || clientSecret.length < 10) {
        throw new Error('Invalid Spotify client secret format');
      }

      // Validate SpotifyApi availability
      if (!SpotifyApi || typeof SpotifyApi.withClientCredentials !== 'function') {
        throw new Error('Spotify API SDK is not properly installed or imported');
      }

      this.spotify = SpotifyApi.withClientCredentials(clientId, clientSecret);

      // Test the connection with timeout and retry logic
      const testConnection = async (retries = 3): Promise<void> => {
        for (let i = 0; i < retries; i++) {
          try {
            const timeoutPromise = new Promise((_, reject) => {
              setTimeout(() => reject(new Error('Spotify connection timeout')), 8000);
            });

            const searchPromise = this.spotify!.search('test', ['track'], 'US', 1);
            await Promise.race([searchPromise, timeoutPromise]);

            this.logger.info('✅ Spotify API initialized successfully');
            return;
          } catch (error) {
            if (i === retries - 1) {
              throw error;
            }
            this.logger.debug(`Spotify connection attempt ${i + 1} failed, retrying...`);
            await new Promise(resolve => setTimeout(resolve, 2000));
          }
        }
      };

      await testConnection();
    } catch (error) {
      this.logger.warn('⚠️ Spotify API unavailable - continuing with YouTube-only mode:', {
        error: error instanceof Error ? error : new Error(String(error)),
      });
      this.spotify = null;
    }
  }

  /**
   * Load persistent queues from database
   * Loads saved music queues and reconstructs them in memory
   */
  private async loadQueuesFromDatabase(): Promise<void> {
    try {
      // Validate database connection
      if (!this.database?.client) {
        throw new Error('Database client is not available');
      }

      this.logger.debug('Loading persistent queues from database...');

      // Load all saved music queue entries (excluding playlists) with timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Database query timeout')), 15000);
      });

      const savedTracks = (await Promise.race([
        this.database.client.musicQueue.findMany({
          where: {
            channelId: {
              not: 'playlist', // Exclude playlist entries
            },
          },
          orderBy: [{ guildId: 'asc' }, { position: 'asc' }],
        }),
        timeoutPromise,
      ])) as any[];

      if (!Array.isArray(savedTracks)) {
        throw new Error('Invalid database response format');
      }

      // Group tracks by guildId and reconstruct queues
      const guildTracks = new Map<string, Track[]>();
      let validTracks = 0;
      let invalidTracks = 0;

      for (const track of savedTracks) {
        try {
          // Validate track data
          if (!track || typeof track !== 'object') {
            invalidTracks++;
            continue;
          }

          if (!track.guildId || typeof track.guildId !== 'string') {
            this.logger.warn('Invalid guildId in saved track:', track);
            invalidTracks++;
            continue;
          }

          if (!track.title || typeof track.title !== 'string') {
            this.logger.warn('Invalid title in saved track:', track);
            invalidTracks++;
            continue;
          }

          if (!track.url || typeof track.url !== 'string' || !this.isValidUrl(track.url)) {
            this.logger.warn('Invalid URL in saved track:', track);
            invalidTracks++;
            continue;
          }

          if (!guildTracks.has(track.guildId)) {
            guildTracks.set(track.guildId, []);
          }

          // Convert database track to Track interface
          const queueTrack: Track = {
            id: track.id || `${Date.now()}-${Math.random()}`,
            title: track.title.trim(),
            artist: track.artist || 'Unknown Artist',
            url: track.url.trim(),
            duration: Math.max(0, parseInt(track.duration) || 0),
            thumbnail: track.thumbnail || '',
            platform: this.determinePlatform(track.url),
            requestedBy: track.requestedBy || 'Unknown',
            addedAt: track.createdAt || new Date(),
          };

          guildTracks.get(track.guildId)!.push(queueTrack);
          validTracks++;
        } catch (trackError) {
          this.logger.warn('Error processing saved track:', trackError);
          invalidTracks++;
        }
      }

      // Reconstruct queues in memory
      let reconstructedQueues = 0;
      for (const [guildId, tracks] of guildTracks) {
        try {
          if (tracks.length > 0) {
            const queue: Queue = {
              guildId,
              tracks,
              currentTrack: null,
              volume: 100,
              loop: 'none',
              shuffle: false,
              filters: [],
              isPaused: false,
              isPlaying: false,
            };

            this.queues.set(guildId, queue);
            reconstructedQueues++;
          }
        } catch (queueError) {
          this.logger.error(`Error reconstructing queue for guild ${guildId}:`, queueError);
        }
      }

      this.logger.info(
        `✅ Loaded ${reconstructedQueues} persistent queues from database (${validTracks} valid tracks, ${invalidTracks} invalid tracks)`
      );
    } catch (error) {
      this.logger.error('❌ Failed to load queues from database:', error);
      // Initialize empty queues map to prevent further errors
      if (!this.queues) {
        this.queues = new Map();
      }
    }
  }

  /**
   * Validate if a URL is properly formatted
   */
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Determine platform from URL
   */
  private determinePlatform(url: string): 'youtube' | 'spotify' {
    if (url.includes('spotify.com')) {
      return 'spotify';
    }
    return 'youtube'; // Default to YouTube
  }

  /**
   * Debounced save queue to database to prevent excessive writes
   */
  private debouncedSaveQueue(guildId: string): void {
    // Clear existing timeout for this guild
    const existingTimeout = this.saveQueueTimeouts.get(guildId);
    if (existingTimeout) {
      clearTimeout(existingTimeout);
    }

    // Set new timeout
    const timeout = setTimeout(() => {
      this.saveQueueToDatabase(guildId).catch(error => {
        this.logger.error(`Error in debounced save for guild ${guildId}:`, error);
      });
      this.saveQueueTimeouts.delete(guildId);
    }, this.SAVE_DEBOUNCE_MS);

    this.saveQueueTimeouts.set(guildId, timeout);
  }

  /**
   * Save queue to database
   * Persists current queue state to database for recovery
   */
  private async saveQueueToDatabase(guildId: string): Promise<void> {
    try {
      // Validate inputs
      if (!guildId || typeof guildId !== 'string') {
        throw new Error('Invalid guildId provided');
      }

      if (!this.database?.client) {
        throw new Error('Database client is not available');
      }

      const queue = this.queues.get(guildId);
      if (!queue) {
        this.logger.debug(`No queue found for guild ${guildId}, skipping save`);
        return;
      }

      if (!Array.isArray(queue.tracks)) {
        throw new Error('Invalid queue tracks format');
      }

      this.logger.debug(`Saving queue for guild ${guildId} with ${queue.tracks.length} tracks`);

      // Use transaction for atomic operation
      await this.database.client.$transaction(async tx => {
        // Remove existing queue entries for this guild
        await tx.musicQueue.deleteMany({
          where: {
            guildId,
            channelId: {
              not: 'playlist', // Don't delete playlist entries
            },
          },
        });

        // Save current queue tracks in batches
        const batchSize = 50;
        for (let i = 0; i < queue.tracks.length; i += batchSize) {
          const batch = queue.tracks.slice(i, i + batchSize);
          const createData = [];

          for (let j = 0; j < batch.length; j++) {
            const track = batch[j];
            if (!track || typeof track !== 'object') {
              this.logger.warn(`Invalid track at position ${i + j}, skipping`);
              continue;
            }

            // Validate track data
            if (!track.title || !track.url || !this.isValidUrl(track.url)) {
              this.logger.warn(`Invalid track data at position ${i + j}:`, track);
              continue;
            }

            createData.push({
              guildId,
              channelId: 'queue', // Identifier for active queue
              title: track.title.substring(0, 255), // Limit title length
              url: track.url,
              duration: Math.max(0, track.duration || 0),
              thumbnail: track.thumbnail?.substring(0, 500) || null, // Limit thumbnail URL length
              requestedBy: track.requestedBy?.substring(0, 100) || 'Unknown',
              position: i + j,
              isPlaying: false,
            });
          }

          if (createData.length > 0) {
            await tx.musicQueue.createMany({
              data: createData,
            });
          }
        }
      });

      this.logger.debug(`✅ Queue saved for guild ${guildId} with ${queue.tracks.length} tracks`);
    } catch (error) {
      this.logger.error(`❌ Failed to save queue for guild ${guildId}:`, error);

      // Try to save at least basic queue info in case of partial failure
      try {
        const queue = this.queues.get(guildId);
        if (queue && queue.tracks.length > 0) {
          await this.cache.set(
            `music_queue_backup_${guildId}`,
            {
              tracks: queue.tracks.slice(0, 10), // Save first 10 tracks as backup
              timestamp: Date.now(),
            },
            3600
          ); // 1 hour cache
          this.logger.debug(`Saved backup queue to cache for guild ${guildId}`);
        }
      } catch (cacheError) {
        this.logger.warn('Failed to save backup queue to cache:', cacheError);
      }
    }
  }

  /**
   * Join a voice channel
   */
  public async joinChannel(channel: VoiceBasedChannel): Promise<VoiceConnection | null> {
    try {
      // Validate input parameters
      if (!channel || typeof channel !== 'object') {
        throw new Error('Invalid voice channel provided');
      }

      if (!channel.id || typeof channel.id !== 'string') {
        throw new Error('Invalid channel ID');
      }

      if (!channel.guild || !channel.guild.id) {
        throw new Error('Invalid guild information');
      }

      if (!channel.guild.voiceAdapterCreator) {
        throw new Error('Voice adapter creator not available');
      }

      // Check if bot has necessary permissions
      if (!channel.permissionsFor(channel.guild.members.me!)?.has(['Connect', 'Speak'])) {
        throw new Error('Missing Connect or Speak permissions for voice channel');
      }

      this.logger.debug(`🔗 Attempting to join voice channel: ${channel.name} (${channel.id})`);

      // Check if already connected to this guild
      const existingConnection = this.connections.get(channel.guild.id);
      if (
        existingConnection &&
        existingConnection.state.status !== VoiceConnectionStatus.Destroyed
      ) {
        this.logger.debug(`Already connected to guild ${channel.guild.id}, reusing connection`);
        return existingConnection;
      }

      const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator as DiscordGatewayAdapterCreator,
        selfDeaf: false,
        selfMute: false,
      });

      // Wait for connection to be ready with timeout
      try {
        await entersState(connection, VoiceConnectionStatus.Ready, 30000);
      } catch (connectionError) {
        this.logger.error('Connection failed to reach Ready state:', connectionError);
        connection.destroy();
        throw new Error('Failed to establish voice connection within timeout');
      }

      this.connections.set(channel.guild.id, connection);

      // Setup connection event listeners with error handling
      this.setupConnectionEvents(connection, channel.guild.id);

      // Create and setup audio player
      await this.setupAudioPlayer(connection, channel.guild.id);

      this.logger.info(`✅ Successfully joined voice channel: ${channel.name} (${channel.id})`);

      return connection;
    } catch (error) {
      this.logger.error(`❌ Failed to join voice channel ${channel?.id || 'unknown'}:`, error);

      // Cleanup on failure
      if (channel?.guild?.id) {
        this.cleanup(channel.guild.id);
      }

      return null;
    }
  }

  /**
   * Setup connection event listeners
   */
  private setupConnectionEvents(connection: VoiceConnection, guildId: string): void {
    try {
      connection.on(VoiceConnectionStatus.Disconnected, async () => {
        this.logger.warn(`🔌 Voice connection disconnected in guild ${guildId}`);
        try {
          // Try to reconnect
          await Promise.race([
            entersState(connection, VoiceConnectionStatus.Signalling, 5000),
            entersState(connection, VoiceConnectionStatus.Connecting, 5000),
          ]);
          this.logger.debug(`Reconnection attempt successful for guild ${guildId}`);
        } catch (reconnectError) {
          this.logger.warn(`Reconnection failed for guild ${guildId}:`, reconnectError);
          connection.destroy();
          this.connections.delete(guildId);

          // Stop current playback
          const queue = this.queues.get(guildId);
          if (queue) {
            queue.isPlaying = false;
            queue.isPaused = false;
          }
        }
      });

      connection.on(VoiceConnectionStatus.Destroyed, () => {
        this.logger.debug(`Voice connection destroyed for guild ${guildId}`);
        this.connections.delete(guildId);
      });

      connection.on('error', error => {
        this.logger.error(`🚨 Voice connection error in guild ${guildId}:`, {
          error: error instanceof Error ? error : new Error(String(error)),
          metadata: { guildId },
        });

        // Attempt to recover from certain errors
        if (error.message.includes('VOICE_CONNECTION_TIMEOUT')) {
          this.logger.debug(`Attempting to recover from timeout error in guild ${guildId}`);
          connection.rejoin();
        }
      });

      connection.on('stateChange', (oldState, newState) => {
        this.logger.debug(
          `Voice connection state changed in guild ${guildId}: ${oldState.status} -> ${newState.status}`
        );
      });
    } catch (error) {
      this.logger.error(`Error setting up connection events for guild ${guildId}:`, error);
    }
  }

  /**
   * Setup audio player for guild
   */
  private async setupAudioPlayer(connection: VoiceConnection, guildId: string): Promise<void> {
    try {
      // Create audio player if not exists
      if (!this.players.has(guildId)) {
        const player = createAudioPlayer({
          behaviors: {
            noSubscriber: NoSubscriberBehavior.Pause,
            maxMissedFrames: Math.round(5000 / 20), // 5 seconds worth of frames
          },
          debug: false,
        });

        this.setupPlayerEvents(player, guildId);
        this.players.set(guildId, player);

        this.logger.debug(`Audio player created for guild ${guildId}`);
      }

      const player = this.players.get(guildId)!;
      const subscription = connection.subscribe(player);

      if (!subscription) {
        throw new Error('Failed to subscribe player to connection');
      }

      this.logger.debug(`✅ Audio player subscribed to connection for guild ${guildId}`);
    } catch (error) {
      this.logger.error(`Failed to setup audio player for guild ${guildId}:`, error);
      throw error;
    }
  }

  /**
   * Leave voice channel
   */
  public leaveChannel(guildId: string): void {
    try {
      // Validate input
      if (!guildId || typeof guildId !== 'string') {
        throw new Error('Invalid guildId provided');
      }

      this.logger.debug(`Leaving voice channel for guild ${guildId}`);

      // Stop and cleanup player
      const player = this.players.get(guildId);
      if (player) {
        try {
          player.stop(true); // Force stop
          this.players.delete(guildId);
          this.logger.debug(`Audio player stopped and removed for guild ${guildId}`);
        } catch (playerError) {
          this.logger.warn(`Error stopping player for guild ${guildId}:`, playerError);
        }
      }

      // Destroy connection
      const connection = this.connections.get(guildId);
      if (connection) {
        try {
          connection.destroy();
          this.connections.delete(guildId);
          this.logger.debug(`Voice connection destroyed for guild ${guildId}`);
        } catch (connectionError) {
          this.logger.warn(`Error destroying connection for guild ${guildId}:`, connectionError);
        }
      }

      // Update queue state
      const queue = this.queues.get(guildId);
      if (queue) {
        queue.isPlaying = false;
        queue.isPaused = false;
        queue.currentTrack = null;
      }

      this.logger.info(`✅ Successfully left voice channel for guild ${guildId}`);
    } catch (error) {
      this.logger.error(`Error leaving voice channel for guild ${guildId}:`, error);
    }
  }

  /**
   * Setup audio player events
   */
  private setupPlayerEvents(player: AudioPlayer, guildId: string): void {
    try {
      // Validate inputs
      if (!player || typeof player !== 'object') {
        throw new Error('Invalid audio player provided');
      }

      if (!guildId || typeof guildId !== 'string') {
        throw new Error('Invalid guildId provided');
      }

      player.on(AudioPlayerStatus.Playing, () => {
        try {
          const queue = this.queues.get(guildId);
          if (queue) {
            queue.isPlaying = true;
            queue.isPaused = false;
            this.logger.info(
              `🎵 Now playing: ${queue.currentTrack?.title || 'Unknown'} in guild ${guildId}`
            );
          } else {
            this.logger.debug(
              `🎵 Audio player is now playing in guild ${guildId} (no queue found)`
            );
          }
        } catch (error) {
          this.logger.error(`Error handling Playing event for guild ${guildId}:`, error);
        }
      });

      player.on(AudioPlayerStatus.Paused, () => {
        try {
          const queue = this.queues.get(guildId);
          if (queue) {
            queue.isPaused = true;
            queue.isPlaying = false;
            this.logger.debug(`⏸️ Playback paused in guild ${guildId}`);
          }
        } catch (error) {
          this.logger.error(`Error handling Paused event for guild ${guildId}:`, error);
        }
      });

      player.on(AudioPlayerStatus.Idle, () => {
        try {
          const queue = this.queues.get(guildId);
          if (queue) {
            queue.isPlaying = false;
            queue.isPaused = false;
            this.logger.debug(`⏹️ Playback stopped in guild ${guildId}`);

            // Handle track end
            this.handleTrackEnd(guildId).catch(error => {
              this.logger.error(`Error handling track end for guild ${guildId}:`, error);
            });
          }
        } catch (error) {
          this.logger.error(`Error handling Idle event for guild ${guildId}:`, {
            error: error instanceof Error ? error : new Error(String(error)),
            metadata: { guildId },
          });
        }
      });

      player.on('error', error => {
        this.logger.error(`🚨 Audio player error in guild ${guildId}:`, {
          error: error instanceof Error ? error : new Error(String(error)),
          metadata: { guildId },
        });

        try {
          const queue = this.queues.get(guildId);
          if (queue) {
            queue.isPlaying = false;
            queue.isPaused = false;

            // Try to skip to next track on error
            this.skip(guildId).catch(skipError => {
              this.logger.error(
                `Failed to skip after player error in guild ${guildId}:`,
                skipError
              );
            });
          }
        } catch (recoveryError) {
          this.logger.error(
            `Error during player error recovery for guild ${guildId}:`,
            recoveryError
          );
        }
      });

      player.on('stateChange', (oldState, newState) => {
        this.logger.debug(
          `Player state changed in guild ${guildId}: ${oldState.status} -> ${newState.status}`
        );
      });

      this.logger.debug(`Player events setup completed for guild ${guildId}`);
    } catch (error) {
      this.logger.error(`Failed to setup player events for guild ${guildId}:`, error);
    }
  }

  /**
   * Handle track end and play next
   */
  private async handleTrackEnd(guildId: string): Promise<void> {
    try {
      // Validate input
      if (!guildId || typeof guildId !== 'string') {
        throw new Error('Invalid guildId provided');
      }

      const queue = this.queues.get(guildId);
      if (!queue) {
        this.logger.debug(`No queue found for guild ${guildId} during track end`);
        return;
      }

      this.logger.debug(`Handling track end for guild ${guildId}, loop mode: ${queue.loop}`);

      // Handle track loop
      if (queue.loop === 'track' && queue.currentTrack) {
        this.logger.debug(`Repeating current track in guild ${guildId}`);
        const success = await this.playTrack(guildId, queue.currentTrack);
        if (!success) {
          this.logger.warn(`Failed to repeat track in guild ${guildId}, trying next track`);
          // Reset loop to avoid infinite recursion and try next track
          const originalLoop = queue.loop;
          queue.loop = 'none';
          await this.handleTrackEnd(guildId);
          queue.loop = originalLoop;
        }
        return;
      }

      // Handle queue loop
      if (queue.loop === 'queue' && queue.currentTrack) {
        this.logger.debug(`Adding current track to end of queue for guild ${guildId}`);
        queue.tracks.push(queue.currentTrack);
      }

      // Play next track
      if (queue.tracks.length > 0) {
        this.logger.debug(
          `Playing next track in guild ${guildId} (${queue.tracks.length} tracks remaining)`
        );

        const nextTrack = queue.shuffle
          ? queue.tracks.splice(Math.floor(Math.random() * queue.tracks.length), 1)[0]
          : queue.tracks.shift();

        if (nextTrack) {
          const success = await this.playTrack(guildId, nextTrack);
          if (!success) {
            this.logger.warn(`Failed to play next track in guild ${guildId}`);
            queue.currentTrack = null;
            queue.isPlaying = false;
            await this.debouncedSaveQueue(guildId);
          }
        } else {
          this.logger.warn(`Next track is null for guild ${guildId}`);
          queue.currentTrack = null;
          queue.isPlaying = false;
          await this.debouncedSaveQueue(guildId);
        }
      } else {
        this.logger.debug(`No more tracks in queue for guild ${guildId}, ending playback`);
        queue.currentTrack = null;
        queue.isPlaying = false;
        queue.isPaused = false;
        await this.debouncedSaveQueue(guildId);
      }
    } catch (error) {
      this.logger.error(`Error handling track end for guild ${guildId}:`, error);

      // Ensure queue state is consistent on error
      const queue = this.queues.get(guildId);
      if (queue) {
        queue.isPlaying = false;
        queue.isPaused = false;
        queue.currentTrack = null;
      }
    }
  }

  /**
   * Search for tracks on YouTube
   */
  public async searchYouTube(query: string, limit: number = 5): Promise<Track[]> {
    try {
      // Validate inputs
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        throw new Error('Invalid search query provided');
      }

      if (typeof limit !== 'number' || limit < 1 || limit > 50) {
        limit = 5; // Default safe limit
      }

      const cleanQuery = query.trim();
      this.logger.debug(`🔍 Searching YouTube for: "${cleanQuery}" (limit: ${limit})`);

      const cacheKey = `music:search:youtube:${cleanQuery}:${limit}`;

      // Try to get from cache, but don't fail if cache is unavailable
      let cached: Track[] | null = null;
      try {
        cached = await this.cache.get<Track[]>(cacheKey);
        if (cached && Array.isArray(cached)) {
          this.logger.debug(
            `📦 Found cached results for: "${cleanQuery}" (${cached.length} tracks)`
          );
          return cached;
        }
      } catch (cacheError) {
        this.logger.warn('Cache unavailable, proceeding without cache:', cacheError);
      }

      const tracks: Track[] = [];
      let processedCount = 0;
      let errorCount = 0;

      // Check if query is a YouTube URL
      if (this.isYouTubeUrl(cleanQuery)) {
        this.logger.debug(`🔗 Processing YouTube URL: ${cleanQuery}`);

        // Clean URL to ensure compatibility (same logic as createYouTubeStream)
        const cleanUrl = cleanQuery.includes('youtube.com/watch?v=')
          ? `https://www.youtube.com/watch?v=${cleanQuery.split('v=')[1]?.split('&')[0]}`
          : cleanQuery;

        this.logger.info(`🧹 Cleaned URL for search: ${cleanUrl}`);

        try {
          // Add timeout for video info request
          const videoInfoPromise = video_basic_info(cleanUrl);
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Video info request timeout')), 15000);
          });

          const videoInfo = await Promise.race([videoInfoPromise, timeoutPromise]);

          // Validate video info structure
          if (!videoInfo || !videoInfo.video_details) {
            throw new Error('Invalid video info structure');
          }

          this.logger.debug('📋 Video info retrieved:', {
            metadata: {
              id: videoInfo.video_details.id,
              title: videoInfo.video_details.title,
              channel: videoInfo.video_details.channel?.name,
              duration: videoInfo.video_details.durationInSec,
            },
          });

          const duration = (videoInfo.video_details.durationInSec || 0) * 1000;
          if (duration > 7200000) {
            // Max 2 hours in milliseconds
            throw new Error(`Video duration too long: ${duration / 1000}s`);
          }

          const track: Track = {
            id: videoInfo.video_details.id || `yt_${Date.now()}`,
            title: (videoInfo.video_details.title || 'Unknown Title').substring(0, 200),
            artist: (videoInfo.video_details.channel?.name || 'Unknown Artist').substring(0, 100),
            duration: duration,
            url: videoInfo.video_details.url || cleanUrl,
            thumbnail: videoInfo.video_details.thumbnails?.[0]?.url || '',
            requestedBy: '',
            platform: 'youtube',
            addedAt: new Date(),
          };

          tracks.push(track);
          processedCount++;
          this.logger.debug(`✅ Successfully processed YouTube URL: ${track.title}`);
        } catch (urlError) {
          this.logger.error(`❌ Failed to get video info from URL "${cleanQuery}":`, urlError);
          errorCount++;
          return [];
        }
      } else {
        this.logger.debug(`🔍 Searching YouTube by text query: "${cleanQuery}"`);
        try {
          // Check if play-dl is available
          if (!play || typeof play.search !== 'function') {
            throw new Error('play-dl is not properly initialized');
          }

          // Search with timeout
          const searchPromise = search(cleanQuery, {
            limit,
            source: { youtube: 'video' },
          });
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('YouTube search timeout')), 15000);
          });

          const searchResults = await Promise.race([searchPromise, timeoutPromise]);

          if (!searchResults || !Array.isArray(searchResults)) {
            throw new Error('Invalid search results structure');
          }

          this.logger.debug(`📊 Search results found: ${searchResults.length} videos`);

          for (const video of searchResults) {
            try {
              if (!video || typeof video !== 'object' || video.type !== 'video') {
                errorCount++;
                continue;
              }

              if (!video.url || typeof video.url !== 'string') {
                this.logger.warn(`Invalid video URL for: ${video.title || 'Unknown'}`);
                errorCount++;
                continue;
              }

              const duration = (video.durationInSec || 0) * 1000;
              if (duration <= 0 || duration > 7200000) {
                // Max 2 hours
                this.logger.warn(
                  `Invalid duration for video: ${video.title} (${duration / 1000}s)`
                );
                errorCount++;
                continue;
              }

              const track: Track = {
                id:
                  video.id || `yt_search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                title: (video.title || 'Unknown Title').substring(0, 200),
                artist: (video.channel?.name || 'Unknown Artist').substring(0, 100),
                duration: duration,
                url: video.url || `https://www.youtube.com/watch?v=${video.id}`,
                thumbnail: video.thumbnails?.[0]?.url || '',
                requestedBy: '',
                platform: 'youtube',
                addedAt: new Date(),
              };

              tracks.push(track);
              processedCount++;
              this.logger.debug(
                `📝 Added track: ${track.title} by ${track.artist} (${track.duration}ms)`
              );
            } catch (trackError) {
              this.logger.warn('Error processing track result:', trackError);
              errorCount++;
              continue;
            }
          }
        } catch (searchError) {
          this.logger.error(`❌ Failed to search YouTube for "${cleanQuery}":`, searchError);
          errorCount++;
          return [];
        }
      }

      this.logger.debug(
        `✅ YouTube search completed: ${tracks.length} tracks found (processed: ${processedCount}, errors: ${errorCount})`
      );

      // Try to cache for 1 hour, but don't fail if cache is unavailable
      if (tracks.length > 0) {
        try {
          await this.cache.set(cacheKey, tracks, 3600);
          this.logger.debug(`💾 Cached search results for: "${cleanQuery}"`);
        } catch (cacheError) {
          this.logger.warn('Failed to cache search results:', cacheError);
        }
      }

      return tracks;
    } catch (error) {
      this.logger.error(`❌ Failed to search YouTube for "${query}":`, error);
      return [];
    }
  }

  /**
   * Search for tracks on Spotify
   */
  public async searchSpotify(query: string, limit: number = 5): Promise<Track[]> {
    try {
      // Validate inputs
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        throw new Error('Invalid search query provided');
      }

      if (typeof limit !== 'number' || limit < 1 || limit > 50) {
        limit = 5; // Default safe limit
      }

      const cleanQuery = query.trim();
      this.logger.debug(`🔍 Searching Spotify for: "${cleanQuery}" (limit: ${limit})`);

      if (!this.spotify) {
        this.logger.warn('Spotify API not initialized, falling back to YouTube');
        return this.searchYouTube(cleanQuery, limit);
      }

      const cacheKey = `music:search:spotify:${cleanQuery}:${limit}`;

      // Try to get from cache, but don't fail if cache is unavailable
      let cached: Track[] | null = null;
      try {
        cached = await this.cache.get<Track[]>(cacheKey);
        if (cached && Array.isArray(cached)) {
          this.logger.debug(
            `📦 Found cached results for: "${cleanQuery}" (${cached.length} tracks)`
          );
          return cached;
        }
      } catch (cacheError) {
        this.logger.warn('Cache unavailable, proceeding without cache:', cacheError);
      }

      const tracks: Track[] = [];
      let processedCount = 0;
      let errorCount = 0;

      // Check if query is a Spotify URL
      if (this.isSpotifyUrl(cleanQuery)) {
        this.logger.debug(`🔗 Processing Spotify URL: ${cleanQuery}`);

        try {
          // Extract track ID from URL
          const trackId = cleanQuery.split('/track/')[1]?.split('?')[0];
          if (!trackId || trackId.length !== 22) {
            // Spotify track IDs are 22 characters
            throw new Error('Invalid Spotify track URL format');
          }

          // Add timeout for Spotify API request
          const trackInfoPromise = this.spotify.tracks.get(trackId);
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Spotify track info request timeout')), 10000);
          });

          const trackInfo = await Promise.race([trackInfoPromise, timeoutPromise]);

          // Validate track info structure
          if (!trackInfo || !trackInfo.id || !trackInfo.name) {
            throw new Error('Invalid track info structure from Spotify');
          }

          if (!trackInfo.external_urls?.spotify) {
            throw new Error('Track missing Spotify URL');
          }

          const duration = trackInfo.duration_ms || 0;
          if (duration <= 0 || duration > 7200000) {
            // Max 2 hours
            throw new Error(`Invalid track duration: ${duration}ms`);
          }

          const track: Track = {
            id: trackInfo.id,
            title: (trackInfo.name || 'Unknown Title').substring(0, 200),
            artist: (
              trackInfo.artists?.map(artist => artist.name).join(', ') || 'Unknown Artist'
            ).substring(0, 100),
            duration: duration,
            url: trackInfo.external_urls.spotify,
            thumbnail: trackInfo.album?.images?.[0]?.url || '',
            requestedBy: '',
            platform: 'spotify',
            addedAt: new Date(),
          };

          tracks.push(track);
          processedCount++;
          this.logger.debug(`✅ Successfully processed Spotify URL: ${track.title}`);
        } catch (urlError) {
          this.logger.error(
            `❌ Failed to get track info from Spotify URL "${cleanQuery}":`,
            urlError
          );
          errorCount++;
          // Fallback to YouTube search
          return this.searchYouTube(cleanQuery, limit);
        }
      } else {
        this.logger.debug(`🔍 Searching Spotify by text query: "${cleanQuery}"`);
        try {
          // Add timeout for Spotify search
          const searchPromise = this.spotify.search(
            cleanQuery,
            ['track'],
            'US',
            Math.min(limit, 50) as any
          );
          const timeoutPromise = new Promise<never>((_, reject) => {
            setTimeout(() => reject(new Error('Spotify search timeout')), 10000);
          });

          const results = await Promise.race([searchPromise, timeoutPromise]);

          // Validate search results structure
          if (!results || !results.tracks || !Array.isArray(results.tracks.items)) {
            throw new Error('Invalid search results structure from Spotify');
          }

          this.logger.debug(`📊 Search results found: ${results.tracks.items.length} tracks`);

          for (const track of results.tracks.items) {
            try {
              // Validate track structure
              if (!track || !track.id || !track.name) {
                this.logger.warn('Invalid track structure in search results');
                errorCount++;
                continue;
              }

              if (!track.external_urls?.spotify) {
                this.logger.warn(`Track missing Spotify URL: ${track.name}`);
                errorCount++;
                continue;
              }

              const duration = track.duration_ms || 0;
              if (duration <= 0 || duration > 7200000) {
                // Max 2 hours
                this.logger.warn(`Invalid duration for track: ${track.name} (${duration}ms)`);
                errorCount++;
                continue;
              }

              const spotifyTrack: Track = {
                id: track.id,
                title: (track.name || 'Unknown Title').substring(0, 200),
                artist: (
                  track.artists?.map((artist: any) => artist.name).join(', ') || 'Unknown Artist'
                ).substring(0, 100),
                duration: duration,
                url: track.external_urls.spotify,
                thumbnail: track.album?.images?.[0]?.url || '',
                requestedBy: '',
                platform: 'spotify' as const,
                addedAt: new Date(),
              };

              tracks.push(spotifyTrack);
              processedCount++;
              this.logger.debug(
                `📝 Added track: ${spotifyTrack.title} by ${spotifyTrack.artist} (${spotifyTrack.duration}ms)`
              );
            } catch (trackError) {
              this.logger.warn('Error processing Spotify track result:', trackError);
              errorCount++;
              continue;
            }
          }
        } catch (searchError) {
          this.logger.error(`❌ Failed to search Spotify for "${cleanQuery}":`, searchError);
          errorCount++;
          // Fallback to YouTube search
          return this.searchYouTube(cleanQuery, limit);
        }
      }

      this.logger.debug(
        `✅ Spotify search completed: ${tracks.length} tracks found (processed: ${processedCount}, errors: ${errorCount})`
      );

      // Try to cache for 1 hour, but don't fail if cache is unavailable
      if (tracks.length > 0) {
        try {
          await this.cache.set(cacheKey, tracks, 3600);
          this.logger.debug(`💾 Cached search results for: "${cleanQuery}"`);
        } catch (cacheError) {
          this.logger.warn('Failed to cache search results:', cacheError);
        }
      }

      return tracks;
    } catch (error) {
      this.logger.error(`❌ Failed to search Spotify for "${query}":`, error);
      // Fallback to YouTube search
      return this.searchYouTube(query, limit);
    }
  }

  /**
   * Add track to queue
   */
  public async addToQueue(guildId: string, track: Track, requestedBy: string): Promise<void> {
    try {
      // Input validation
      if (!guildId || typeof guildId !== 'string' || guildId.trim().length === 0) {
        throw new Error('Invalid guildId provided');
      }

      if (!track || typeof track !== 'object') {
        throw new Error('Invalid track object provided');
      }

      if (!requestedBy || typeof requestedBy !== 'string' || requestedBy.trim().length === 0) {
        throw new Error('Invalid requestedBy provided');
      }

      // Validate track properties
      if (!track.id || !track.title || !track.url) {
        throw new Error('Track missing required properties (id, title, url)');
      }

      if (!this.isValidUrl(track.url)) {
        throw new Error('Invalid track URL format');
      }

      // Validate track duration (max 2 hours)
      if (track.duration && track.duration > 7200) {
        throw new Error('Track duration exceeds maximum allowed (2 hours)');
      }

      let queue = this.queues.get(guildId);

      if (!queue) {
        queue = {
          guildId,
          tracks: [],
          currentTrack: null,
          volume: 50,
          loop: 'none',
          shuffle: false,
          filters: [],
          isPaused: false,
          isPlaying: false,
        };
        this.queues.set(guildId, queue);
        this.logger.debug(`Created new queue for guild ${guildId}`);
      }

      // Check queue size limit (max 100 tracks)
      if (queue.tracks.length >= 100) {
        throw new Error('Queue is full (maximum 100 tracks)');
      }

      // Sanitize and set track metadata
      track.requestedBy = requestedBy.trim();
      track.addedAt = new Date();

      // Truncate long strings to prevent database issues
      if (track.title.length > 200) {
        track.title = track.title.substring(0, 197) + '...';
      }

      if (track.artist && track.artist.length > 100) {
        track.artist = track.artist.substring(0, 97) + '...';
      }

      queue.tracks.push(track);

      // Save to database with error handling
      try {
        await this.debouncedSaveQueue(guildId);
      } catch (dbError) {
        this.logger.error(`Failed to save queue to database for guild ${guildId}:`, dbError);
        // Don't throw here, track is already added to memory
      }

      this.logger.music(
        'TRACK_ADDED',
        guildId,
        `Added track: ${track.title} (Queue: ${queue.tracks.length})`
      );
    } catch (error) {
      this.logger.error(`Failed to add track to queue for guild ${guildId}:`, error);
      throw error;
    }
  }

  /**
   * Add track by search query or URL (for API)
   */
  public async addTrack(
    guildId: string,
    query: string,
    requestedBy: string
  ): Promise<{ success: boolean; message: string; track?: Track }> {
    try {
      // Input validation
      if (!guildId || typeof guildId !== 'string' || guildId.trim().length === 0) {
        return {
          success: false,
          message: 'Invalid guild ID provided',
        };
      }

      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return {
          success: false,
          message: 'Invalid search query provided',
        };
      }

      if (!requestedBy || typeof requestedBy !== 'string' || requestedBy.trim().length === 0) {
        return {
          success: false,
          message: 'Invalid user ID provided',
        };
      }

      // Sanitize query
      query = query.trim();

      // Check query length
      if (query.length > 500) {
        return {
          success: false,
          message: 'Search query too long (maximum 500 characters)',
        };
      }

      let tracks: Track[] = [];
      let searchMethod = 'unknown';

      this.logger.debug(`🎵 Adding track for query: "${query}" in guild ${guildId}`);

      // Check if query is a URL
      if (this.isYouTubeUrl(query)) {
        this.logger.debug('🔗 Detected YouTube URL');
        searchMethod = 'YouTube URL';
        tracks = await this.searchYouTube(query, 1);
      } else if (this.isSpotifyUrl(query)) {
        this.logger.debug('🎵 Detected Spotify URL');
        searchMethod = 'Spotify URL';
        tracks = await this.searchSpotify(query, 1);
      } else {
        this.logger.debug('🔍 Searching for text query');
        searchMethod = 'text search';

        // Search query - try YouTube first, then Spotify
        try {
          tracks = await this.searchYouTube(query, 1);
          if (tracks.length > 0) {
            searchMethod = 'YouTube search';
          }
        } catch (youtubeError) {
          this.logger.warn(`YouTube search failed for query "${query}":`, youtubeError);
        }

        if (tracks.length === 0) {
          this.logger.debug('🎵 No YouTube results, trying Spotify');
          try {
            tracks = await this.searchSpotify(query, 1);
            if (tracks.length > 0) {
              searchMethod = 'Spotify search';
            }
          } catch (spotifyError) {
            this.logger.warn(`Spotify search failed for query "${query}":`, spotifyError);
          }
        }
      }

      if (tracks.length === 0) {
        this.logger.warn(`❌ No tracks found for query: "${query}" (tried ${searchMethod})`);
        return {
          success: false,
          message: `No tracks found for the given query (searched via ${searchMethod})`,
        };
      }

      const track = tracks[0];
      if (!track) {
        return {
          success: false,
          message: 'Invalid track data received from search',
        };
      }

      this.logger.debug(`✅ Found track: ${track.title} by ${track.artist} (via ${searchMethod})`);

      // Add to queue with error handling
      try {
        await this.addToQueue(guildId, track, requestedBy);
      } catch (addError) {
        this.logger.error('Failed to add track to queue:', addError);
        return {
          success: false,
          message: `Found track but failed to add to queue: ${addError instanceof Error ? addError.message : 'Unknown error'}`,
        };
      }

      return {
        success: true,
        message: `Track added to queue successfully (found via ${searchMethod})`,
        track,
      };
    } catch (error) {
      this.logger.error(`❌ Failed to add track for query "${query}":`, error);
      return {
        success: false,
        message: `Failed to add track to queue: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Create YouTube stream using yt-dlp + play-dl hybrid approach
   */
  // Stream URL cache to prevent repeated API calls
  private streamCache = new Map<string, { url: string; expires: number }>();
  private activeStreams = new Map<string, Promise<AudioResource | null>>();

  private async createYouTubeStream(url: string): Promise<AudioResource | null> {
    try {
      // Input validation
      if (!url || typeof url !== 'string') {
        this.logger.error('❌ Invalid URL provided to createYouTubeStream');
        return null;
      }

      const trimmedUrl = url.trim();
      if (trimmedUrl.length === 0) {
        this.logger.error('❌ Empty URL provided to createYouTubeStream');
        return null;
      }

      // Validate that it's a YouTube URL
      if (!this.isYouTubeUrl(trimmedUrl)) {
        this.logger.error(`❌ Not a valid YouTube URL: ${trimmedUrl}`);
        return null;
      }

      // Extract video ID for caching
      let videoId = '';
      if (trimmedUrl.includes('youtube.com/watch?v=')) {
        videoId = trimmedUrl.split('v=')[1]?.split('&')[0]?.split('#')[0] || '';
      } else if (trimmedUrl.includes('youtu.be/')) {
        videoId =
          trimmedUrl.split('youtu.be/')[1]?.split('?')[0]?.split('&')[0]?.split('#')[0] || '';
      } else if (trimmedUrl.includes('youtube.com/embed/')) {
        videoId = trimmedUrl.split('embed/')[1]?.split('?')[0]?.split('&')[0]?.split('#')[0] || '';
      }

      // Validate video ID format
      if (!videoId || videoId.length !== 11 || !/^[a-zA-Z0-9_-]+$/.test(videoId)) {
        this.logger.error(`❌ Invalid YouTube video ID extracted: '${videoId}' from URL: ${url}`);
        return null;
      }

      // Check if stream creation is already in progress for this video
      if (this.activeStreams.has(videoId)) {
        this.logger.debug(
          `⏳ Stream creation already in progress for video ${videoId}, waiting...`
        );
        return await this.activeStreams.get(videoId)!;
      }

      // Create promise for this stream creation
      const streamPromise = this.createStreamInternal(videoId, trimmedUrl);
      this.activeStreams.set(videoId, streamPromise);

      try {
        const result = await streamPromise;
        return result;
      } finally {
        // Clean up active stream tracking
        this.activeStreams.delete(videoId);
      }
    } catch (error) {
      this.logger.error(`❌ Failed to create YouTube stream for "${url}":`, error);
      return null;
    }
  }

  private async createStreamInternal(
    videoId: string,
    originalUrl: string
  ): Promise<AudioResource | null> {
    const cleanUrl = `https://www.youtube.com/watch?v=${videoId}`;
    this.logger.info(`🎵 Creating YouTube stream for: \`${cleanUrl}\``);

    // Check cache for existing stream URL
    const cached = this.streamCache.get(videoId);
    if (cached && cached.expires > Date.now()) {
      this.logger.debug(`📦 Using cached stream URL for video ${videoId}`);
      try {
        return await this.createAudioResourceFromUrl(cached.url);
      } catch (cacheError) {
        this.logger.warn(
          '⚠️ Cached stream URL failed, proceeding with fresh extraction:',
          cacheError
        );
        this.streamCache.delete(videoId);
      }
    }

    // Method 1: Try play-dl (more reliable than yt-dlp)
    try {
      this.logger.info('🔄 STARTING play-dl method...');

      // Add timeout for video info request
      const info = (await Promise.race([
        video_basic_info(cleanUrl),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('play-dl video_basic_info timeout after 15s')), 15000)
        ),
      ])) as any;

      if (!info || !info.video_details) {
        throw new Error('Could not get video info from play-dl');
      }

      // Validate video details
      if (!info.video_details.title || !info.video_details.id) {
        throw new Error('Invalid video details from play-dl');
      }

      // Check video duration (max 2 hours)
      const duration = info.video_details.durationInSec || 0;
      if (duration > 7200) {
        throw new Error(`Video too long: ${duration}s (max 7200s)`);
      }

      this.logger.debug(`📋 Video info: ${info.video_details.title} (${duration}s)`);

      // Get stream with timeout
      const stream = (await Promise.race([
        stream_from_info(info, { quality: 2, discordPlayerCompatibility: true }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('play-dl stream timeout after 15s')), 15000)
        ),
      ])) as any;

      if (!stream || !stream.stream) {
        throw new Error('Failed to get stream from play-dl');
      }

      this.logger.info('✅ play-dl method succeeded - creating audio resource');

      // Cache the stream URL if available
      if (stream.url) {
        this.streamCache.set(videoId, {
          url: stream.url,
          expires: Date.now() + 30 * 60 * 1000, // Cache for 30 minutes
        });
      }

      const resource = createAudioResource(stream.stream, {
        inputType: stream.type || StreamType.Arbitrary,
        inlineVolume: true,
        metadata: {
          title: info.video_details.title,
        },
      });

      return resource;
    } catch (playDlError: any) {
      this.logger.warn(`⚠️ play-dl method failed: ${playDlError.message}`);
    }

    // Method 2: Fallback to yt-dlp (if available)
    try {
      this.logger.info('🔄 STARTING yt-dlp fallback method...');

      const { exec } = require('child_process');
      const { promisify } = require('util');
      const execAsync = promisify(exec);

      // Use yt-dlp to get the best audio URL with shorter timeout
      const ytDlpCommand = `python -m yt_dlp -f "bestaudio[ext=m4a]/bestaudio[ext=webm]/bestaudio" --get-url "${cleanUrl}"`;

      const { stdout, stderr } = (await Promise.race([
        execAsync(ytDlpCommand, { timeout: 20000 }),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error('yt-dlp timeout after 20s')), 20000)
        ),
      ])) as any;

      if (stderr && !stderr.includes('WARNING')) {
        throw new Error(`yt-dlp stderr: ${stderr}`);
      }

      const audioUrl = stdout?.trim();
      if (!audioUrl || typeof audioUrl !== 'string' || !audioUrl.startsWith('http')) {
        throw new Error(`Invalid audio URL from yt-dlp: ${audioUrl}`);
      }

      this.logger.info('✅ yt-dlp extracted audio URL');

      // Cache the extracted URL
      this.streamCache.set(videoId, {
        url: audioUrl,
        expires: Date.now() + 15 * 60 * 1000, // Cache for 15 minutes (shorter for yt-dlp)
      });

      return await this.createAudioResourceFromUrl(audioUrl);
    } catch (ytDlpError: any) {
      this.logger.warn(`⚠️ yt-dlp method failed: ${ytDlpError.message}`);
    }

    this.logger.error(`❌ All stream creation methods failed for video ${videoId}`);
    return null;
  }

  private async createAudioResourceFromUrl(audioUrl: string): Promise<AudioResource> {
    const https = require('https');
    const http = require('http');
    const protocol = audioUrl.startsWith('https:') ? https : http;

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Stream request timeout after 10s'));
      }, 10000);

      const request = protocol.get(
        audioUrl,
        {
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            Accept: 'audio/*,*/*;q=0.9',
            'Accept-Encoding': 'identity',
            Range: 'bytes=0-',
          },
          timeout: 8000,
        },
        (response: any) => {
          clearTimeout(timeout);

          if (response.statusCode !== 200 && response.statusCode !== 206) {
            reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
            return;
          }

          const resource = createAudioResource(response, {
            inputType: StreamType.Arbitrary,
            inlineVolume: true,
            metadata: {
              title: 'Audio Stream',
            },
          });

          resolve(resource);
        }
      );

      request.on('error', (error: any) => {
        clearTimeout(timeout);
        reject(error);
      });

      request.on('timeout', () => {
        clearTimeout(timeout);
        request.destroy();
        reject(new Error('Stream request timeout'));
      });
    });
  }

  /**
   * Play a track
   */
  public async playTrack(guildId: string, track: Track): Promise<boolean> {
    try {
      this.logger.debug(
        `🎵 Starting playTrack for: ${track.title} (${track.platform}) in guild ${guildId}`
      );

      const player = this.players.get(guildId);
      if (!player) {
        this.logger.error(`❌ No audio player found for guild ${guildId}`);
        return false;
      }

      this.logger.debug(`🎮 Player found, current status: ${player.state.status}`);

      let resource: AudioResource;

      if (track.platform === 'youtube') {
        this.logger.debug(`📺 Creating YouTube stream for: ${track.url}`);

        try {
          const streamResource = await this.createYouTubeStream(track.url);
          if (!streamResource) {
            this.logger.error(`❌ Failed to create stream for ${track.url}`);
            return false;
          }
          resource = streamResource;
        } catch (streamError) {
          this.logger.error(`❌ Stream creation error for ${track.url}:`, streamError);
          return false;
        }
      } else {
        this.logger.debug(
          `🎵 Converting Spotify track to YouTube: ${track.artist} - ${track.title}`
        );

        // For Spotify, we need to find the YouTube equivalent
        const youtubeResults = await this.searchYouTube(`${track.artist} ${track.title}`, 1);
        if (youtubeResults.length === 0) {
          this.logger.error(
            `❌ Could not find YouTube equivalent for Spotify track: ${track.title}`
          );
          return false;
        }

        const firstResult = youtubeResults[0];
        if (!firstResult) {
          throw new Error('No YouTube results found');
        }

        this.logger.debug(`📺 Found YouTube equivalent: ${firstResult.url}`);

        try {
          const streamResource = await this.createYouTubeStream(firstResult.url);
          if (!streamResource) {
            this.logger.error(
              `❌ Failed to create stream for converted Spotify track: ${firstResult.url}`
            );
            return false;
          }
          resource = streamResource;
        } catch (streamError) {
          this.logger.error(
            `❌ Stream creation error for converted Spotify track ${firstResult.url}:`,
            streamError
          );
          return false;
        }
      }

      this.logger.debug('📦 Audio resource created successfully');

      // Verify resource properties
      this.logger.debug(
        `🔍 Resource properties - readable: ${resource.readable}, ended: ${resource.ended}`
      );
      this.logger.debug(`🔍 Resource volume available: ${resource.volume ? 'Yes' : 'No'}`);

      // Add resource error handling
      resource.playStream.on('error', error => {
        this.logger.error('❌ Audio resource stream error:', {
          error: error instanceof Error ? error : new Error(String(error)),
        });
      });

      resource.playStream.on('end', () => {
        this.logger.debug('🔚 Audio resource stream ended');
      });

      const queue = this.queues.get(guildId);
      if (queue) {
        queue.currentTrack = track;
        const volumeLevel = queue.volume / 100;
        if (resource.volume) {
          resource.volume.setVolume(volumeLevel);
          this.logger.debug(`🔊 Volume set to ${queue.volume}% (${volumeLevel})`);
        } else {
          this.logger.warn('⚠️ No volume control available for resource');
        }
      }

      this.logger.debug('▶️ Starting playback with player.play()');
      player.play(resource);

      // Wait a moment to ensure the player starts
      await new Promise(resolve => setTimeout(resolve, 500));

      // Check if player is actually playing
      this.logger.debug(`🔍 Checking player status after play command: ${player.state.status}`);

      if (player.state.status === AudioPlayerStatus.Playing) {
        this.logger.music(
          'TRACK_PLAYING',
          guildId,
          `✅ Successfully playing: ${track.title} (${track.platform})`
        );

        // Update queue status
        if (queue) {
          queue.isPlaying = true;
          queue.isPaused = false;
          await this.debouncedSaveQueue(guildId);
        }

        return true;
      } else if (player.state.status === AudioPlayerStatus.Buffering) {
        this.logger.debug('⏳ Player is buffering, waiting for playback to start...');

        // Wait up to 15 seconds for buffering to complete
        try {
          await entersState(player, AudioPlayerStatus.Playing, 15000);
          this.logger.music(
            'TRACK_PLAYING',
            guildId,
            `✅ Successfully playing after buffering: ${track.title} (${track.platform})`
          );

          // Update queue status
          if (queue) {
            queue.isPlaying = true;
            queue.isPaused = false;
            await this.debouncedSaveQueue(guildId);
          }

          return true;
        } catch (bufferError) {
          this.logger.error(`❌ Buffering timeout for track: ${track.title}`, bufferError);
          return false;
        }
      } else {
        this.logger.error(`❌ Player failed to start playing. Status: ${player.state.status}`, {
          error: new Error(`Player failed to start playing with status: ${player.state.status}`),
        });

        // Log additional debug info
        this.logger.debug('🔍 Player state details:', {
          metadata: {
            status: player.state.status,
            resource: resource ? 'exists' : 'null',
            readable: resource?.readable,
            ended: resource?.ended,
          },
        });

        return false;
      }

      // Check if resource has readable stream
      if (resource.readable) {
        this.logger.debug('✅ Audio resource is readable');
      } else {
        this.logger.warn('⚠️ Audio resource is not readable');
      }

      await this.debouncedSaveQueue(guildId);

      return true;
    } catch (error) {
      this.logger.error(`❌ Failed to play track ${track.title}:`, error);
      return false;
    }
  }

  /**
   * Play next track in queue
   */
  public async playNext(guildId: string): Promise<boolean> {
    const queue = this.queues.get(guildId);
    if (!queue || queue.tracks.length === 0) {
      return false;
    }

    const nextTrack = queue.shuffle
      ? queue.tracks.splice(Math.floor(Math.random() * queue.tracks.length), 1)[0]
      : queue.tracks.shift()!;

    if (nextTrack) {
      return await this.playTrack(guildId, nextTrack);
    }
    return false;
  }

  /**
   * Pause playback
   */
  public pause(guildId: string): boolean {
    const player = this.players.get(guildId);
    if (player) {
      return player.pause();
    }
    return false;
  }

  /**
   * Resume playback
   */
  public resume(guildId: string): boolean {
    const player = this.players.get(guildId);
    if (player) {
      return player.unpause();
    }
    return false;
  }

  /**
   * Stop playback and clear queue
   */
  public async stop(guildId: string): Promise<void> {
    const player = this.players.get(guildId);
    if (player) {
      player.stop();
    }

    const queue = this.queues.get(guildId);
    if (queue) {
      queue.tracks = [];
      queue.currentTrack = null;
      queue.isPlaying = false;
      queue.isPaused = false;
      await this.debouncedSaveQueue(guildId);
    }
  }

  /**
   * Skip current track
   */
  public async skip(guildId: string): Promise<boolean> {
    const player = this.players.get(guildId);
    if (player) {
      player.stop(); // This will trigger the 'idle' event and play next track
      return true;
    }
    return false;
  }

  /**
   * Set volume
   */
  public async setVolume(guildId: string, volume: number): Promise<boolean> {
    const queue = this.queues.get(guildId);
    if (!queue) {
      return false;
    }

    volume = Math.max(0, Math.min(100, volume));
    queue.volume = volume;

    const player = this.players.get(guildId);
    if (player && player.state.status === AudioPlayerStatus.Playing) {
      const resource = (player.state as any).resource;
      if (resource?.volume) {
        resource.volume.setVolume(volume / 100);
      }
    }

    await this.debouncedSaveQueue(guildId);
    return true;
  }

  /**
   * Set loop mode
   */
  public async setLoop(guildId: string, mode: 'none' | 'track' | 'queue'): Promise<void> {
    const queue = this.queues.get(guildId);
    if (queue) {
      queue.loop = mode;
      await this.debouncedSaveQueue(guildId);
    }
  }

  /**
   * Toggle shuffle
   */
  public async toggleShuffle(guildId: string): Promise<boolean> {
    const queue = this.queues.get(guildId);
    if (queue) {
      queue.shuffle = !queue.shuffle;
      await this.debouncedSaveQueue(guildId);
      return queue.shuffle;
    }
    return false;
  }

  /**
   * Get queue for guild
   */
  public getQueue(guildId: string): Queue | null {
    return this.queues.get(guildId) || null;
  }

  /**
   * Clear queue
   */
  public async clearQueue(guildId: string): Promise<void> {
    const queue = this.queues.get(guildId);
    if (queue) {
      queue.tracks = [];
      await this.debouncedSaveQueue(guildId);
    }
  }

  /**
   * Remove track from queue
   */
  public async removeTrack(guildId: string, index: number): Promise<Track | null> {
    const queue = this.queues.get(guildId);
    if (queue && index >= 0 && index < queue.tracks.length) {
      const removed = queue.tracks.splice(index, 1)[0];
      await this.debouncedSaveQueue(guildId);
      return removed || null;
    }
    return null;
  }

  /**
   * Parse duration string to seconds
   */
  private parseDuration(duration: string | null): number {
    if (!duration) {
      return 0;
    }

    const parts = duration.split(':').reverse();
    let seconds = 0;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part) {
        seconds += parseInt(part, 10) * Math.pow(60, i);
      }
    }

    return seconds;
  }

  /**
   * Check if URL is from Spotify
   */
  public isSpotifyUrl(url: string): boolean {
    return url.includes('spotify.com') || url.includes('open.spotify.com');
  }

  /**
   * Check if URL is from YouTube
   */
  public isYouTubeUrl(url: string): boolean {
    return url.includes('youtube.com') || url.includes('youtu.be');
  }

  /**
   * Format duration seconds to string
   */
  public formatDuration(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes}:${secs.toString().padStart(2, '0')}`;
  }

  /**
   * Get connection status
   */
  public isConnected(guildId: string): boolean {
    const connection = this.connections.get(guildId);
    return connection?.state.status === VoiceConnectionStatus.Ready;
  }

  /**
   * Remove track from queue by index (alias for removeTrack)
   */
  public async removeFromQueue(guildId: string, index: number): Promise<Track | null> {
    return await this.removeTrack(guildId, index);
  }

  /**
   * Move track in queue from one position to another
   */
  public async moveInQueue(
    guildId: string,
    fromIndex: number,
    toIndex: number
  ): Promise<Track | null> {
    const queue = this.queues.get(guildId);
    if (
      !queue ||
      fromIndex < 0 ||
      fromIndex >= queue.tracks.length ||
      toIndex < 0 ||
      toIndex >= queue.tracks.length
    ) {
      return null;
    }

    const [movedTrack] = queue.tracks.splice(fromIndex, 1);
    if (!movedTrack) {
      return null;
    }

    queue.tracks.splice(toIndex, 0, movedTrack);
    await this.debouncedSaveQueue(guildId);

    return movedTrack;
  }

  /**
   * Save playlist to database
   * Uses MusicQueue model to store playlist tracks with special naming convention
   */
  public async savePlaylist(userId: string, name: string, tracks: Track[]): Promise<boolean> {
    try {
      // Create a special guildId for playlists: playlist_userId_playlistName
      const playlistId = `playlist_${userId}_${name.replace(/[^a-zA-Z0-9]/g, '_')}`;

      // Remove existing playlist with same name
      await this.database.client.musicQueue.deleteMany({
        where: {
          guildId: playlistId,
        },
      });

      // Save each track as a MusicQueue entry
      for (let i = 0; i < tracks.length; i++) {
        const track = tracks[i];
        if (!track) {
          continue;
        }

        await this.database.client.musicQueue.create({
          data: {
            guildId: playlistId,
            channelId: 'playlist', // Special identifier for playlists
            title: track.title,
            url: track.url,
            duration: track.duration,
            thumbnail: track.thumbnail || null,
            requestedBy: userId,
            position: i,
            isPlaying: false,
          },
        });
      }

      this.logger.info(
        `Playlist '${name}' saved successfully for user ${userId} with ${tracks.length} tracks`
      );
      return true;
    } catch (error) {
      this.logger.error(`Failed to save playlist ${name} for user ${userId}:`, error);
      return false;
    }
  }

  /**
   * Cleanup resources for guild
   */
  public cleanup(guildId: string): void {
    this.leaveChannel(guildId);
    this.queues.delete(guildId);
  }
}
