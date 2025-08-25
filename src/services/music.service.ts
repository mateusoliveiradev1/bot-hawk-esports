import { AudioPlayer, AudioPlayerStatus, AudioResource, createAudioPlayer, createAudioResource, demuxProbe, DiscordGatewayAdapterCreator, entersState, getVoiceConnection, joinVoiceChannel, VoiceConnection, VoiceConnectionStatus } from '@discordjs/voice';
import { Guild, GuildMember, VoiceBasedChannel } from 'discord.js';
import ytdl from 'ytdl-core';
import ytsr from 'ytsr';
import { SpotifyApi } from '@spotify/web-api-ts-sdk';
import { Logger } from '@/utils/logger';
import { CacheService } from './cache.service';
import { DatabaseService } from '@/database/database.service';

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
    surrounding: 'surround'
  };

  constructor() {
    this.logger = new Logger();
    this.cache = new CacheService();
    this.database = new DatabaseService();
    
    this.initializeSpotify();
    this.loadQueuesFromDatabase();
  }

  /**
   * Initialize Spotify API
   */
  private async initializeSpotify(): Promise<void> {
    try {
      const clientId = process.env.SPOTIFY_CLIENT_ID;
      const clientSecret = process.env.SPOTIFY_CLIENT_SECRET;
      
      if (clientId && clientSecret) {
        this.spotify = SpotifyApi.withClientCredentials(
          clientId,
          clientSecret
        );
        this.logger.info('Spotify API initialized successfully');
      } else {
        this.logger.warn('Spotify credentials not provided. Spotify features will be disabled.');
      }
    } catch (error) {
      this.logger.error('Failed to initialize Spotify API:', error);
    }
  }

  /**
   * Load persistent queues from database
   * TODO: Update MusicQueue schema to support full queue persistence
   */
  private async loadQueuesFromDatabase(): Promise<void> {
    try {
      // Temporarily disabled due to schema mismatch
      // The current MusicQueue model only stores individual tracks, not full queues
      // Need to update schema to include queue state fields
      
      // const savedQueues = await this.database.client.musicQueue.findMany({
      //   include: {
      //     guild: true
      //   }
      // });
      
      this.logger.info('Queue loading temporarily disabled - schema update required');
    } catch (error) {
      this.logger.error('Failed to load queues from database:', error);
    }
  }

  /**
   * Save queue to database
   */
  private async saveQueueToDatabase(guildId: string): Promise<void> {
    try {
      // Temporarily disabled due to schema mismatch
      // The current MusicQueue model doesn't support full queue persistence
      // TODO: Update schema to include queue state fields or implement track-by-track storage
      
      // const queue = this.queues.get(guildId);
      // if (!queue) return;
      
      this.logger.debug(`Queue save skipped for guild ${guildId} - schema update required`);
    } catch (error) {
      this.logger.error(`Failed to save queue for guild ${guildId}:`, error);
    }
  }

  /**
   * Join a voice channel
   */
  public async joinChannel(channel: VoiceBasedChannel): Promise<VoiceConnection | null> {
    try {
      const connection = joinVoiceChannel({
        channelId: channel.id,
        guildId: channel.guild.id,
        adapterCreator: channel.guild.voiceAdapterCreator as DiscordGatewayAdapterCreator,
      });

      // Wait for connection to be ready
      await entersState(connection, VoiceConnectionStatus.Ready, 30000);
      
      this.connections.set(channel.guild.id, connection);
      
      // Create audio player if not exists
      if (!this.players.has(channel.guild.id)) {
        const player = createAudioPlayer();
        this.setupPlayerEvents(player, channel.guild.id);
        this.players.set(channel.guild.id, player);
        connection.subscribe(player);
      }
      
      this.logger.music('VOICE_JOINED', channel.guild.id, {
        channelId: channel.id,
        channelName: channel.name
      });
      
      return connection;
    } catch (error) {
      this.logger.error(`Failed to join voice channel ${channel.id}:`, error);
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
      }
      this.logger.music('TRACK_STARTED', guildId);
    });

    player.on(AudioPlayerStatus.Paused, () => {
      const queue = this.queues.get(guildId);
      if (queue) {
        queue.isPaused = true;
        queue.isPlaying = false;
      }
      this.logger.music('TRACK_PAUSED', guildId);
    });

    player.on(AudioPlayerStatus.Idle, () => {
      const queue = this.queues.get(guildId);
      if (queue) {
        queue.isPlaying = false;
        queue.isPaused = false;
        this.handleTrackEnd(guildId);
      }
    });

    player.on('error', (error) => {
      this.logger.error(`Audio player error in guild ${guildId}:`, error);
      this.handleTrackEnd(guildId);
    });
  }

  /**
   * Handle track end and play next
   */
  private async handleTrackEnd(guildId: string): Promise<void> {
    const queue = this.queues.get(guildId);
    if (!queue) return;

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
        queue.tracks.shift()!;
      
      await this.playTrack(guildId, nextTrack);
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
      const cacheKey = `music:search:youtube:${query}:${limit}`;
      const cached = await this.cache.get<Track[]>(cacheKey);
      
      if (cached) {
        return cached;
      }

      const searchResults = await ytsr(query, { limit });
      const tracks: Track[] = [];

      for (const item of searchResults.items) {
        if (item.type === 'video') {
          const video = item as ytsr.Video;
          
          tracks.push({
            id: video.id,
            title: video.title,
            artist: video.author?.name || 'Unknown',
            duration: this.parseDuration(video.duration),
            url: video.url,
            thumbnail: video.bestThumbnail?.url || '',
            requestedBy: '',
            platform: 'youtube',
            addedAt: new Date()
          });
        }
      }
      
      // Cache for 1 hour
      await this.cache.set(cacheKey, tracks, 3600);
      
      return tracks;
    } catch (error) {
      this.logger.error(`Failed to search YouTube for "${query}":`, error);
      return [];
    }
  }

  /**
   * Search for tracks on Spotify
   */
  public async searchSpotify(query: string, limit: number = 5): Promise<Track[]> {
    try {
      if (!this.spotify) {
        this.logger.warn('Spotify API not available');
        return [];
      }

      const cacheKey = `music:search:spotify:${query}:${limit}`;
      const cached = await this.cache.get<Track[]>(cacheKey);
      
      if (cached) {
        return cached;
      }

      const results = await this.spotify.search(query, ['track'], 'US', limit);
      const tracks: Track[] = [];

      for (const track of results.tracks.items) {
        tracks.push({
          id: track.id,
          title: track.name,
          artist: track.artists.map(artist => artist.name).join(', '),
          duration: Math.floor(track.duration_ms / 1000),
          url: track.external_urls.spotify,
          thumbnail: track.album.images[0]?.url || '',
          requestedBy: '',
          platform: 'spotify',
          addedAt: new Date()
        });
      }
      
      // Cache for 1 hour
      await this.cache.set(cacheKey, tracks, 3600);
      
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
        isPlaying: false
      };
      this.queues.set(guildId, queue);
    }
    
    track.requestedBy = requestedBy;
    track.addedAt = new Date();
    
    queue.tracks.push(track);
    
    await this.saveQueueToDatabase(guildId);
    
    this.logger.music('TRACK_ADDED', guildId, {
      trackTitle: track.title,
      queueLength: queue.tracks.length
    });
  }

  /**
   * Add track by search query (for API)
   */
  public async addTrack(guildId: string, query: string, requestedBy: string): Promise<{ success: boolean; message: string; track?: Track }> {
    try {
      // Search for tracks
      let tracks = await this.searchYouTube(query, 1);
      
      if (tracks.length === 0) {
        tracks = await this.searchSpotify(query, 1);
      }
      
      if (tracks.length === 0) {
        return {
          success: false,
          message: 'No tracks found for the given query'
        };
      }
      
      const track = tracks[0];
      await this.addToQueue(guildId, track, requestedBy);
      
      return {
        success: true,
        message: 'Track added to queue successfully',
        track
      };
    } catch (error) {
      this.logger.error(`Failed to add track for query "${query}":`, error);
      return {
        success: false,
        message: 'Failed to add track to queue'
      };
    }
  }

  /**
   * Play a track
   */
  public async playTrack(guildId: string, track: Track): Promise<boolean> {
    try {
      const player = this.players.get(guildId);
      if (!player) {
        this.logger.error(`No audio player found for guild ${guildId}`);
        return false;
      }

      let resource: AudioResource;
      
      if (track.platform === 'youtube') {
        const stream = ytdl(track.url, {
          filter: 'audioonly',
          quality: 'highestaudio',
          highWaterMark: 1 << 25
        });
        
        resource = createAudioResource(stream, {
          inputType: 'arbitrary',
          inlineVolume: true
        });
      } else {
        // For Spotify, we need to find the YouTube equivalent
        const youtubeResults = await this.searchYouTube(`${track.artist} ${track.title}`, 1);
        if (youtubeResults.length === 0) {
          this.logger.error(`Could not find YouTube equivalent for Spotify track: ${track.title}`);
          return false;
        }
        
        const stream = ytdl(youtubeResults[0].url, {
          filter: 'audioonly',
          quality: 'highestaudio',
          highWaterMark: 1 << 25
        });
        
        resource = createAudioResource(stream, {
          inputType: 'arbitrary',
          inlineVolume: true
        });
      }

      const queue = this.queues.get(guildId);
      if (queue) {
        queue.currentTrack = track;
        resource.volume?.setVolume(queue.volume / 100);
      }

      player.play(resource);
      
      await this.saveQueueToDatabase(guildId);
      
      this.logger.music('TRACK_PLAYING', guildId, {
        trackTitle: track.title,
        platform: track.platform
      });
      
      return true;
    } catch (error) {
      this.logger.error(`Failed to play track ${track.title}:`, error);
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
    
    return await this.playTrack(guildId, nextTrack);
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
    if (!queue) return false;
    
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
      return removed;
    }
    return null;
  }

  /**
   * Parse duration string to seconds
   */
  private parseDuration(duration: string | null): number {
    if (!duration) return 0;
    
    const parts = duration.split(':').map(Number);
    if (parts.length === 2) {
      return parts[0] * 60 + parts[1];
    } else if (parts.length === 3) {
      return parts[0] * 3600 + parts[1] * 60 + parts[2];
    }
    return 0;
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
   * Cleanup resources for guild
   */
  public cleanup(guildId: string): void {
    this.leaveChannel(guildId);
    this.queues.delete(guildId);
  }
}