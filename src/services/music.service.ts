import { AudioPlayer, AudioPlayerStatus, AudioResource, createAudioPlayer, createAudioResource, demuxProbe, DiscordGatewayAdapterCreator, entersState, getVoiceConnection, joinVoiceChannel, NoSubscriberBehavior, VoiceConnection, VoiceConnectionStatus, StreamType } from '@discordjs/voice';
import { Guild, GuildMember, VoiceBasedChannel } from 'discord.js';
import ytdl from '@distube/ytdl-core';
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
    this.cache = cache || new CacheService();
    this.database = database || new DatabaseService();
    
    this.initializePlayDl();
    this.initializeSpotify();
    this.loadQueuesFromDatabase();
  }

  /**
   * Initialize play-dl
   */
  private async initializePlayDl(): Promise<void> {
    try {
      this.logger.debug('🎵 Initializing play-dl...');
      
      // Try to get a free client ID for YouTube access
      const clientID = await getFreeClientID();
      if (clientID) {
        await setToken({
          youtube: {
            cookie: ''
          }
        });
        this.logger.info('✅ Play-dl initialized with cookie configuration');
      } else {
        this.logger.warn('⚠️ Could not get free client ID for play-dl, some features may be limited');
      }
    } catch (error) {
      this.logger.warn('⚠️ Play-dl initialization failed, continuing without token:', (error as Error).message || 'Unknown error');
    }
  }

  /**
   * Initialize Spotify API
   */
  private async initializeSpotify(): Promise<void> {
    try {
      const clientId = process.env.SPOTIFY_CLIENT_ID;
      const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
      
      if (!clientId || !clientSecret) {
        this.logger.warn('🎵 Spotify credentials not found - running in YouTube-only mode');
        return;
      }
      
      this.spotify = SpotifyApi.withClientCredentials(
        clientId,
        clientSecret
      );
      
      // Test the connection with timeout
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Spotify connection timeout')), 5000);
      });
      
      await Promise.race([
        this.spotify.search('test', ['track'], 'US', 1),
        timeoutPromise
      ]);
      
      this.logger.info('✅ Spotify API initialized successfully');
    } catch (error) {
      this.logger.warn('⚠️ Spotify API unavailable - continuing with YouTube-only mode:', (error as Error).message || 'Connection failed');
      this.spotify = null;
    }
  }

  /**
   * Load persistent queues from database
   * Loads saved music queues and reconstructs them in memory
   */
  private async loadQueuesFromDatabase(): Promise<void> {
    try {
      // Load all saved music queue entries (excluding playlists)
      const savedTracks = await this.database.client.musicQueue.findMany({
        where: {
          channelId: {
            not: 'playlist' // Exclude playlist entries
          }
        },
        orderBy: [
          { guildId: 'asc' },
          { position: 'asc' }
        ]
      });
      
      // Group tracks by guildId and reconstruct queues
      const guildTracks = new Map<string, any[]>();
      
      for (const track of savedTracks) {
        if (!guildTracks.has(track.guildId)) {
          guildTracks.set(track.guildId, []);
        }
        
        // Convert database track to Track interface
        const queueTrack = {
          title: track.title,
          artist: 'Unknown Artist', // Not stored in current schema
          url: track.url,
          duration: track.duration || 0,
          thumbnail: track.thumbnail || '',
          platform: track.url.includes('youtube') ? 'youtube' as const : 'spotify' as const,
          requestedBy: track.requestedBy
        };
        
        guildTracks.get(track.guildId)!.push(queueTrack);
      }
      
      // Reconstruct queues in memory
      for (const [guildId, tracks] of guildTracks) {
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
            isPlaying: false
          };
          
          this.queues.set(guildId, queue);
        }
      }
      
      this.logger.info(`Loaded ${guildTracks.size} persistent queues from database`);
    } catch (error) {
      this.logger.error('Failed to load queues from database:', error);
    }
  }

  /**
   * Save queue to database
   * Persists current queue state to database for recovery
   */
  private async saveQueueToDatabase(guildId: string): Promise<void> {
    try {
      const queue = this.queues.get(guildId);
      if (!queue) return;
      
      // Remove existing queue entries for this guild
      await this.database.client.musicQueue.deleteMany({
        where: {
          guildId,
          channelId: {
            not: 'playlist' // Don't delete playlist entries
          }
        }
      });
      
      // Save current queue tracks
       for (let i = 0; i < queue.tracks.length; i++) {
         const track = queue.tracks[i];
         if (!track) continue;
         
         await this.database.client.musicQueue.create({
           data: {
             guildId,
             channelId: 'queue', // Identifier for active queue
             title: track.title,
             url: track.url,
             duration: track.duration,
             thumbnail: track.thumbnail || null,
             requestedBy: track.requestedBy,
             position: i,
             isPlaying: false
           }
         });
       }
      
      this.logger.debug(`Queue saved for guild ${guildId} with ${queue.tracks.length} tracks`);
    } catch (error) {
      this.logger.error(`Failed to save queue for guild ${guildId}:`, error);
    }
  }

  /**
   * Join a voice channel
   */
  public async joinChannel(channel: VoiceBasedChannel): Promise<VoiceConnection | null> {
    try {
      this.logger.debug(`🔗 Attempting to join voice channel: ${channel.name} (${channel.id})`);
      
      const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator as DiscordGatewayAdapterCreator,
        selfDeaf: false,
        selfMute: false,
      });

      // Wait for connection to be ready
      await entersState(connection, VoiceConnectionStatus.Ready, 30000);
      
      this.connections.set(channel.guild.id, connection);
      
      // Setup connection event listeners
      connection.on(VoiceConnectionStatus.Disconnected, async () => {
        this.logger.warn(`🔌 Voice connection disconnected in guild ${channel.guild.id}`);
        try {
          await Promise.race([
            entersState(connection, VoiceConnectionStatus.Signalling, 5000),
            entersState(connection, VoiceConnectionStatus.Connecting, 5000),
          ]);
        } catch {
          connection.destroy();
          this.connections.delete(channel.guild.id);
        }
      });
      
      connection.on('error', (error) => {
        this.logger.error(`🚨 Voice connection error in guild ${channel.guild.id}:`, error);
      });
      
      // Create audio player if not exists
      if (!this.players.has(channel.guild.id)) {
        const player = createAudioPlayer({
          behaviors: {
            noSubscriber: NoSubscriberBehavior.Pause,
          },
        });
        this.setupPlayerEvents(player, channel.guild.id);
        this.players.set(channel.guild.id, player);
        
        const subscription = connection.subscribe(player);
        if (!subscription) {
          this.logger.error(`❌ Failed to subscribe player to connection in guild ${channel.guild.id}`);
          return null;
        }
        
        this.logger.debug(`✅ Audio player created and subscribed for guild ${channel.guild.id}`);
      }
      
      this.logger.music('VOICE_JOINED', channel.guild.id, `🎤 Successfully joined channel: ${channel.name} (${channel.id})`);
      
      return connection;
    } catch (error) {
      this.logger.error(`❌ Failed to join voice channel ${channel.id}:`, error);
      return null;
    }
  }

  /**
   * Leave voice channel
   */
  public leaveChannel(guildId: string): void {
    const connection = this.connections.get(guildId);
    if (connection) {
      connection.destroy();
      this.connections.delete(guildId);
    }
    
    const player = this.players.get(guildId);
    if (player) {
      player.stop();
      this.players.delete(guildId);
    }
    
    this.logger.music('VOICE_LEFT', guildId);
  }

  /**
   * Setup audio player events
   */
  private setupPlayerEvents(player: AudioPlayer, guildId: string): void {
    player.on(AudioPlayerStatus.Playing, () => {
      const queue = this.queues.get(guildId);
      if (queue) {
        queue.isPlaying = true;
        queue.isPaused = false;
        this.logger.music('TRACK_STARTED', guildId, `🎵 Audio player is now playing: ${queue.currentTrack?.title || 'Unknown'}`);
      } else {
        this.logger.music('TRACK_STARTED', guildId, '🎵 Audio player is now playing (no queue found)');
      }
    });

    player.on(AudioPlayerStatus.Paused, () => {
      const queue = this.queues.get(guildId);
      if (queue) {
        queue.isPaused = true;
        queue.isPlaying = false;
        this.logger.music('TRACK_PAUSED', guildId, `⏸️ Audio player paused: ${queue.currentTrack?.title || 'Unknown'}`);
      } else {
        this.logger.music('TRACK_PAUSED', guildId, '⏸️ Audio player paused (no queue found)');
      }
    });

    player.on(AudioPlayerStatus.Idle, () => {
      const queue = this.queues.get(guildId);
      if (queue) {
        queue.isPlaying = false;
        queue.isPaused = false;
        this.logger.music('TRACK_ENDED', guildId, `⏹️ Audio player is now idle, track ended: ${queue.currentTrack?.title || 'Unknown'}`);
        this.handleTrackEnd(guildId);
      } else {
        this.logger.music('TRACK_ENDED', guildId, '⏹️ Audio player is now idle (no queue found)');
      }
    });

    player.on(AudioPlayerStatus.Buffering, () => {
      const queue = this.queues.get(guildId);
      const trackInfo = queue?.currentTrack?.title || 'Unknown';
      this.logger.music('TRACK_BUFFERING', guildId, `⏳ Audio player is buffering: ${trackInfo}`);
    });

    player.on(AudioPlayerStatus.AutoPaused, () => {
      const queue = this.queues.get(guildId);
      const trackInfo = queue?.currentTrack?.title || 'Unknown';
      this.logger.warn(`🔇 Audio player auto-paused in guild ${guildId} - possible connection issue. Track: ${trackInfo}`);
    });

    player.on('error', (error) => {
      const queue = this.queues.get(guildId);
      const trackInfo = queue?.currentTrack?.title || 'Unknown';
      this.logger.error(`❌ Audio player error in guild ${guildId} for track ${trackInfo}:`, error);
      this.handleTrackEnd(guildId);
    });

    player.on('stateChange', (oldState, newState) => {
      const queue = this.queues.get(guildId);
      const trackInfo = queue?.currentTrack?.title || 'Unknown';
      this.logger.debug(`🔄 Player state changed from ${oldState.status} to ${newState.status} in guild ${guildId} for track: ${trackInfo}`);
      
      // Additional debug info for resource
      if (newState.status === AudioPlayerStatus.Playing && 'resource' in newState) {
        const resource = (newState as any).resource;
        this.logger.debug(`📊 Resource info - readable: ${resource?.readable}, ended: ${resource?.ended}`);
      }
    });
  }

  /**
   * Handle track end and play next
   */
  private async handleTrackEnd(guildId: string): Promise<void> {
    const queue = this.queues.get(guildId);
    if (!queue) {
      return;
    }

    // Handle loop modes
    if (queue.loop === 'track' && queue.currentTrack) {
      await this.playTrack(guildId, queue.currentTrack);
      return;
    }

    if (queue.loop === 'queue' && queue.currentTrack) {
      queue.tracks.push(queue.currentTrack);
    }

    // Play next track
    if (queue.tracks.length > 0) {
      const nextTrack = queue.shuffle ? 
        queue.tracks.splice(Math.floor(Math.random() * queue.tracks.length), 1)[0] :
        queue.tracks.shift();
      
      if (nextTrack) {
        await this.playTrack(guildId, nextTrack);
      }
    } else {
      queue.currentTrack = null;
      await this.saveQueueToDatabase(guildId);
    }
  }

  /**
   * Search for tracks on YouTube
   */
  public async searchYouTube(query: string, limit: number = 5): Promise<Track[]> {
    try {
      this.logger.debug(`🔍 Searching YouTube for: "${query}" (limit: ${limit})`);
      
      const cacheKey = `music:search:youtube:${query}:${limit}`;
      
      // Try to get from cache, but don't fail if cache is unavailable
      let cached: Track[] | null = null;
      try {
        cached = await this.cache.get<Track[]>(cacheKey);
        if (cached) {
          this.logger.debug(`📦 Found cached results for: "${query}" (${cached.length} tracks)`);
          return cached;
        }
      } catch (cacheError) {
        this.logger.warn('Cache unavailable, proceeding without cache:', cacheError);
      }

      let tracks: Track[] = [];

      // Check if query is a YouTube URL
      if (this.isYouTubeUrl(query)) {
        this.logger.debug(`🔗 Processing YouTube URL: ${query}`);
        try {
          // Get video info directly from URL
          const videoInfo = await video_basic_info(query);
          
          this.logger.debug(`📋 Video info retrieved:`, {
            id: videoInfo.video_details.id,
            title: videoInfo.video_details.title,
            channel: videoInfo.video_details.channel?.name,
            duration: videoInfo.video_details.durationInSec
          });
          
          const track: Track = {
            id: videoInfo.video_details.id || `yt_${Date.now()}`,
            title: videoInfo.video_details.title || 'Unknown Title',
            artist: videoInfo.video_details.channel?.name || 'Unknown Artist',
            duration: (videoInfo.video_details.durationInSec || 0) * 1000, // Convert to milliseconds
            url: videoInfo.video_details.url || query,
            thumbnail: videoInfo.video_details.thumbnails?.[0]?.url || '',
            requestedBy: '',
            platform: 'youtube',
            addedAt: new Date(),
          };
          
          tracks.push(track);
          this.logger.debug(`✅ Successfully processed YouTube URL: ${track.title}`);
        } catch (urlError) {
          this.logger.error(`❌ Failed to get video info from URL "${query}":`, urlError);
          return [];
        }
      } else {
        this.logger.debug(`🔍 Searching YouTube by text query: "${query}"`);
        try {
          // Search by text query
          const searchResults = await search(query, {
            limit,
            source: { youtube: 'video' }
          });
          
          this.logger.debug(`📊 Search results found: ${searchResults.length} videos`);
          
          for (const video of searchResults) {
            if (video.type === 'video') {
              const track: Track = {
                id: video.id || `yt_search_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                title: video.title || 'Unknown Title',
                artist: video.channel?.name || 'Unknown Artist',
                duration: (video.durationInSec || 0) * 1000, // Convert to milliseconds
                url: video.url || `https://www.youtube.com/watch?v=${video.id}`,
                thumbnail: video.thumbnails?.[0]?.url || '',
                requestedBy: '',
                platform: 'youtube',
                addedAt: new Date(),
              };
              
              tracks.push(track);
              this.logger.debug(`📝 Added track: ${track.title} by ${track.artist} (${track.duration}ms)`);
            }
          }
        } catch (searchError) {
          this.logger.error(`❌ Failed to search YouTube for "${query}":`, searchError);
          return [];
        }
      }
      
      this.logger.debug(`✅ YouTube search completed: ${tracks.length} tracks found`);
      
      // Try to cache for 1 hour, but don't fail if cache is unavailable
      try {
        await this.cache.set(cacheKey, tracks, 3600);
        this.logger.debug(`💾 Cached search results for: "${query}"`);
      } catch (cacheError) {
        this.logger.warn('Failed to cache search results:', cacheError);
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
    if (!this.spotify) {
      this.logger.warn('Spotify API not initialized');
      return [];
    }
    
    try {
      const cacheKey = `music:search:spotify:${query}:${limit}`;
      
      // Try to get from cache, but don't fail if cache is unavailable
      let cached: Track[] | null = null;
      try {
        cached = await this.cache.get<Track[]>(cacheKey);
      } catch (cacheError) {
        this.logger.warn('Cache unavailable, proceeding without cache:', cacheError);
      }
      
      if (cached) {
        return cached;
      }

      const results = await this.spotify.search(query, ['track'], 'US', Math.min(limit, 50) as any);
      
      const tracks = results.tracks.items.map((track: any) => ({
        id: track.id,
        title: track.name,
        artist: track.artists.map((artist: any) => artist.name).join(', '),
        duration: track.duration_ms, // Keep in milliseconds
        url: track.external_urls.spotify,
        thumbnail: track.album.images[0]?.url || '',
        requestedBy: '',
        platform: 'spotify' as const,
        addedAt: new Date()
      })) || [];
      
      // Try to cache for 1 hour, but don't fail if cache is unavailable
      try {
        await this.cache.set(cacheKey, tracks, 3600);
      } catch (cacheError) {
        this.logger.warn('Failed to cache search results:', cacheError);
      }
      
      return tracks;
    } catch (error) {
      this.logger.error(`Failed to search Spotify for "${query}":`, error);
      return [];
    }
  }

  /**
   * Add track to queue
   */
  public async addToQueue(guildId: string, track: Track, requestedBy: string): Promise<void> {
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
    }
    
    track.requestedBy = requestedBy;
    track.addedAt = new Date();
    
    queue.tracks.push(track);
    
    await this.saveQueueToDatabase(guildId);
    
    this.logger.music('TRACK_ADDED', guildId, `Added track: ${track.title} (Queue: ${queue.tracks.length})`);
  }

  /**
   * Add track by search query or URL (for API)
   */
  public async addTrack(guildId: string, query: string, requestedBy: string): Promise<{ success: boolean; message: string; track?: Track }> {
    try {
      let tracks: Track[] = [];
      
      this.logger.debug(`🎵 Adding track for query: "${query}" in guild ${guildId}`);
      
      // Check if query is a URL
      if (this.isYouTubeUrl(query)) {
        this.logger.debug(`🔗 Detected YouTube URL`);
        // Handle YouTube URL directly
        tracks = await this.searchYouTube(query, 1);
      } else if (this.isSpotifyUrl(query)) {
        this.logger.debug(`🎵 Detected Spotify URL`);
        // Handle Spotify URL
        tracks = await this.searchSpotify(query, 1);
      } else {
        this.logger.debug(`🔍 Searching for text query`);
        // Search query - try YouTube first, then Spotify
        tracks = await this.searchYouTube(query, 1);
        
        if (tracks.length === 0) {
          this.logger.debug(`🎵 No YouTube results, trying Spotify`);
          tracks = await this.searchSpotify(query, 1);
        }
      }
      
      if (tracks.length === 0) {
        this.logger.warn(`❌ No tracks found for query: "${query}"`);
        return {
          success: false,
          message: 'No tracks found for the given query',
        };
      }
      
      const track = tracks[0];
      if (track) {
        this.logger.debug(`✅ Found track: ${track.title} by ${track.artist}`);
        await this.addToQueue(guildId, track, requestedBy);
      }
      
      return {
        success: true,
        message: 'Track added to queue successfully',
        track,
      };
    } catch (error) {
      this.logger.error(`❌ Failed to add track for query "${query}":`, error);
      return {
        success: false,
        message: 'Failed to add track to queue',
      };
    }
  }

  /**
   * Create YouTube stream with fallback methods
   */
  private async createYouTubeStream(url: string): Promise<AudioResource | null> {
    this.logger.debug(`🎵 Creating YouTube stream for: ${url}`);
    
    // Method 1: Try ytdl-core first
    try {
      this.logger.debug(`🔄 Trying ytdl-core method...`);
      
      const isValid = await ytdl.validateURL(url);
      if (!isValid) {
        throw new Error('Invalid YouTube URL');
      }
      
      const info = await ytdl.getInfo(url);
      this.logger.debug(`📋 Video info: ${info.videoDetails.title} - ${info.videoDetails.lengthSeconds}s`);
      
      const stream = ytdl(url, {
        filter: 'audioonly',
        quality: 'highestaudio',
        highWaterMark: 1 << 25,
        requestOptions: {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate, br',
            'DNT': '1',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1'
          }
        },
        begin: Date.now()
      });
      
      stream.on('error', (error) => {
        this.logger.error(`❌ YouTube stream error for ${url}:`, error);
      });
      
      stream.on('info', (info) => {
        this.logger.debug(`📊 Stream info received: ${info.videoDetails.title}`);
      });
      
      this.logger.debug(`✅ ytdl-core stream created successfully`);
      return createAudioResource(stream, {
        inputType: StreamType.Arbitrary,
        inlineVolume: true,
      });
      
    } catch (ytdlError: any) {
      this.logger.warn(`⚠️ ytdl-core failed: ${ytdlError.message}`);
      
      // Check for various YouTube access/parsing issues
      const isYouTubeIssue = ytdlError.statusCode === 403 || 
                             ytdlError.message?.includes('403') || 
                             ytdlError.message?.includes('Status code: 403') ||
                             ytdlError.message?.includes('parsing watch.html') ||
                             ytdlError.message?.includes('YouTube made a change') ||
                             ytdlError.message?.includes('Could not extract functions');
      
      if (isYouTubeIssue) {
        this.logger.debug(`🔄 Trying play-dl fallback method due to YouTube issue...`);
        
        try {
          // Method 2: Try play-dl as fallback
          const info = await video_basic_info(url);
          if (!info || !info.video_details) {
            throw new Error('Could not get video info from play-dl');
          }
          
          this.logger.debug(`📋 Play-dl video info: ${info.video_details.title}`);
          
          // Try to get audio stream from play-dl
          const stream = await stream_from_info(info, { quality: 2 }) as any;
          if (!stream || !stream.stream) {
            throw new Error('Could not get audio stream from play-dl');
          }
          
          this.logger.debug(`✅ play-dl fallback stream created successfully`);
          return createAudioResource(stream.stream, {
            inputType: StreamType.Arbitrary,
            inlineVolume: true,
          });
          
        } catch (playDlError: any) {
          this.logger.error(`❌ play-dl fallback also failed: ${playDlError.message}`);
          
          // Try one more fallback with different play-dl approach
          try {
            this.logger.debug(`🔄 Trying alternative play-dl method...`);
            const streamUrl = `https://www.youtube.com/watch?v=${url.split('v=')[1]?.split('&')[0]}`;
            const altInfo = await video_basic_info(streamUrl);
            
            if (altInfo && altInfo.video_details) {
              const altStream = await stream_from_info(altInfo, { quality: 0 }) as any;
              if (altStream && altStream.stream) {
                this.logger.debug(`✅ Alternative play-dl method succeeded`);
                return createAudioResource(altStream.stream, {
                  inputType: StreamType.Arbitrary,
                  inlineVolume: true,
                });
              }
            }
          } catch (altError: any) {
            this.logger.error(`❌ Alternative play-dl method failed: ${altError.message}`);
          }
        }
      }
    }
    
    this.logger.error(`❌ All streaming methods failed for: ${url}`);
    return null;
  }

  /**
   * Play a track
   */
  public async playTrack(guildId: string, track: Track): Promise<boolean> {
    try {
      this.logger.debug(`🎵 Starting playTrack for: ${track.title} (${track.platform}) in guild ${guildId}`);
      
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
        this.logger.debug(`🎵 Converting Spotify track to YouTube: ${track.artist} - ${track.title}`);
        
        // For Spotify, we need to find the YouTube equivalent
        const youtubeResults = await this.searchYouTube(`${track.artist} ${track.title}`, 1);
        if (youtubeResults.length === 0) {
          this.logger.error(`❌ Could not find YouTube equivalent for Spotify track: ${track.title}`);
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
            this.logger.error(`❌ Failed to create stream for converted Spotify track: ${firstResult.url}`);
            return false;
          }
          resource = streamResource;
        } catch (streamError) {
          this.logger.error(`❌ Stream creation error for converted Spotify track ${firstResult.url}:`, streamError);
          return false;
        }
      }

      this.logger.debug(`📦 Audio resource created successfully`);
      
      // Verify resource properties
      this.logger.debug(`🔍 Resource properties - readable: ${resource.readable}, ended: ${resource.ended}`);
      this.logger.debug(`🔍 Resource volume available: ${resource.volume ? 'Yes' : 'No'}`);
      
      // Add resource error handling
      resource.playStream.on('error', (error) => {
        this.logger.error(`❌ Audio resource stream error:`, error);
      });
      
      resource.playStream.on('end', () => {
        this.logger.debug(`🔚 Audio resource stream ended`);
      });

      const queue = this.queues.get(guildId);
      if (queue) {
        queue.currentTrack = track;
        const volumeLevel = queue.volume / 100;
        if (resource.volume) {
          resource.volume.setVolume(volumeLevel);
          this.logger.debug(`🔊 Volume set to ${queue.volume}% (${volumeLevel})`);
        } else {
          this.logger.warn(`⚠️ No volume control available for resource`);
        }
      }

      this.logger.debug(`▶️ Starting playback with player.play()`);
      player.play(resource);
      
      // Wait a moment to ensure the player starts
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Check if player is actually playing
      this.logger.debug(`🔍 Checking player status after play command: ${player.state.status}`);
      
      if (player.state.status === AudioPlayerStatus.Playing) {
        this.logger.music('TRACK_PLAYING', guildId, `✅ Successfully playing: ${track.title} (${track.platform})`);
        
        // Update queue status
        if (queue) {
          queue.isPlaying = true;
          queue.isPaused = false;
          await this.saveQueueToDatabase(guildId);
        }
        
        return true;
      } else if (player.state.status === AudioPlayerStatus.Buffering) {
        this.logger.debug(`⏳ Player is buffering, waiting for playback to start...`);
        
        // Wait up to 15 seconds for buffering to complete
        try {
          await entersState(player, AudioPlayerStatus.Playing, 15000);
          this.logger.music('TRACK_PLAYING', guildId, `✅ Successfully playing after buffering: ${track.title} (${track.platform})`);
          
          // Update queue status
          if (queue) {
            queue.isPlaying = true;
            queue.isPaused = false;
            await this.saveQueueToDatabase(guildId);
          }
          
          return true;
        } catch (bufferError) {
          this.logger.error(`❌ Buffering timeout for track: ${track.title}`, bufferError);
          return false;
        }
      } else {
        this.logger.error(`❌ Player failed to start playing. Status: ${player.state.status}`);
        
        // Log additional debug info
        this.logger.debug(`🔍 Player state details:`, {
          status: player.state.status,
          resource: resource ? 'exists' : 'null',
          readable: resource?.readable,
          ended: resource?.ended
        });
        
        return false;
      }
      
      // Check if resource has readable stream
      if (resource.readable) {
        this.logger.debug(`✅ Audio resource is readable`);
      } else {
        this.logger.warn(`⚠️ Audio resource is not readable`);
      }
      
      await this.saveQueueToDatabase(guildId);
      
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

    const nextTrack = queue.shuffle ? 
      queue.tracks.splice(Math.floor(Math.random() * queue.tracks.length), 1)[0] :
      queue.tracks.shift()!;
    
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
      await this.saveQueueToDatabase(guildId);
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
    
    await this.saveQueueToDatabase(guildId);
    return true;
  }

  /**
   * Set loop mode
   */
  public async setLoop(guildId: string, mode: 'none' | 'track' | 'queue'): Promise<void> {
    const queue = this.queues.get(guildId);
    if (queue) {
      queue.loop = mode;
      await this.saveQueueToDatabase(guildId);
    }
  }

  /**
   * Toggle shuffle
   */
  public async toggleShuffle(guildId: string): Promise<boolean> {
    const queue = this.queues.get(guildId);
    if (queue) {
      queue.shuffle = !queue.shuffle;
      await this.saveQueueToDatabase(guildId);
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
      await this.saveQueueToDatabase(guildId);
    }
  }

  /**
   * Remove track from queue
   */
  public async removeTrack(guildId: string, index: number): Promise<Track | null> {
    const queue = this.queues.get(guildId);
    if (queue && index >= 0 && index < queue.tracks.length) {
      const removed = queue.tracks.splice(index, 1)[0];
      await this.saveQueueToDatabase(guildId);
      return removed || null;
    }
    return null;
  }

  /**
   * Parse duration string to seconds
   */
  private parseDuration(duration: string | null): number {
    if (!duration) return 0;
    
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
  public async moveInQueue(guildId: string, fromIndex: number, toIndex: number): Promise<Track | null> {
    const queue = this.queues.get(guildId);
    if (!queue || fromIndex < 0 || fromIndex >= queue.tracks.length || toIndex < 0 || toIndex >= queue.tracks.length) {
      return null;
    }

    const [movedTrack] = queue.tracks.splice(fromIndex, 1);
    if (!movedTrack) {
      return null;
    }
    
    queue.tracks.splice(toIndex, 0, movedTrack);
    await this.saveQueueToDatabase(guildId);
    
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
          guildId: playlistId
        }
      });
      
      // Save each track as a MusicQueue entry
       for (let i = 0; i < tracks.length; i++) {
         const track = tracks[i];
         if (!track) continue;
         
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
             isPlaying: false
           }
         });
       }
      
      this.logger.info(`Playlist '${name}' saved successfully for user ${userId} with ${tracks.length} tracks`);
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