import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import compression from 'compression';
import { Logger } from '../utils/logger';
import { DatabaseService } from '../database/database.service';
import { CacheService } from './cache.service';
import { PUBGService } from './pubg.service';
import { RankingService } from './ranking.service';
import { BadgeService } from './badge.service';
import { PresenceService } from './presence.service';
import { MusicService } from './music.service';
import { GameService } from './game.service';
import { ClipService } from './clip.service';
import { ExtendedClient } from '../types/client';
import { Server } from 'http';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';

export interface APIConfig {
  port: number;
  host: string;
  corsOrigins: string[];
  jwtSecret: string;
  jwtExpiresIn: string;
  rateLimitWindowMs: number;
  rateLimitMax: number;
  uploadMaxSize: number;
  uploadDir: string;
}

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    guildId: string;
    username: string;
    discriminator: string;
    avatar?: string;
    roles: string[];
    permissions: string[];
  };
}

export interface APIResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * API Service for handling web requests and dashboard integration
 */
export class APIService {
  private app: Express;
  private server: Server | null = null;
  private logger: Logger;
  private database: DatabaseService;
  private cache: CacheService;
  private pubgService: PUBGService;
  private rankingService: RankingService;
  private badgeService: BadgeService;
  private presenceService: PresenceService;
  private musicService: MusicService;
  private gameService: GameService;
  private clipService: ClipService;
  private client: ExtendedClient;
  private config: APIConfig;

  private upload!: multer.Multer;

  constructor(client: ExtendedClient) {
    this.client = client;
    this.logger = new Logger();
    this.database = new DatabaseService();
    this.cache = new CacheService();
    this.pubgService = new PUBGService();
    this.rankingService = new RankingService(client);
    this.badgeService = new BadgeService(client);
    this.presenceService = new PresenceService(client);
    this.musicService = new MusicService();
    this.gameService = new GameService(client);
    this.clipService = new ClipService(client);

    this.config = {
      port: parseInt(process.env.API_PORT || '3001'),
      host: process.env.API_HOST || '0.0.0.0',
      corsOrigins: process.env.CORS_ORIGINS?.split(',') || [
        'http://localhost:3000',
      ],
      jwtSecret: process.env.JWT_SECRET || 'your-secret-key',
      jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
      rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000'), // 15 minutes
      rateLimitMax: parseInt(process.env.RATE_LIMIT_MAX || '100'),
      uploadMaxSize: parseInt(process.env.UPLOAD_MAX_SIZE || '104857600'), // 100MB
      uploadDir: process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'),
    };

    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupErrorHandling();
  }

  /**
   * Setup middleware
   */
  private setupMiddleware(): void {
    // Security
    this.app.use(
      helmet({
        contentSecurityPolicy: {
          directives: {
            defaultSrc: ['\'self\''],
            styleSrc: ['\'self\'', '\'unsafe-inline\''],
            scriptSrc: ['\'self\''],
            imgSrc: ['\'self\'', 'data:', 'https:'],
            connectSrc: ['\'self\''],
            fontSrc: ['\'self\''],
            objectSrc: ['\'none\''],
            mediaSrc: ['\'self\''],
            frameSrc: ['\'none\''],
          },
        },
      }),
    );

    // CORS
    this.app.use(
      cors({
        origin: this.config.corsOrigins,
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
      }),
    );

    // Rate limiting
    const limiter = rateLimit({
      windowMs: this.config.rateLimitWindowMs,
      max: this.config.rateLimitMax,
      message: {
        success: false,
        error: 'Too many requests, please try again later.',
      },
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use('/api/', limiter);

    // Compression
    this.app.use(compression());

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // File upload
    this.upload = multer({
      storage: multer.diskStorage({
        destination: (req, file, cb) => {
          const uploadPath = path.join(this.config.uploadDir, 'clips');
          if (!fs.existsSync(uploadPath)) {
            fs.mkdirSync(uploadPath, { recursive: true });
          }
          cb(null, uploadPath);
        },
        filename: (req, file, cb) => {
          const uniqueSuffix =
            Date.now() + '-' + Math.round(Math.random() * 1e9);
          cb(
            null,
            file.fieldname +
              '-' +
              uniqueSuffix +
              path.extname(file.originalname),
          );
        },
      }),
      limits: {
        fileSize: this.config.uploadMaxSize,
      },
      fileFilter: (req, file, cb) => {
        const allowedTypes = ['.mp4', '.mov', '.avi', '.mkv', '.webm'];
        const ext = path.extname(file.originalname).toLowerCase();

        if (allowedTypes.includes(ext)) {
          cb(null, true);
        } else {
          cb(new Error('Invalid file type. Only video files are allowed.'));
        }
      },
    });

    // Request logging
    this.app.use((req: Request, res: Response, next: NextFunction) => {
      this.logger.api(req.method, req.path, 200, 0, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        body: req.method !== 'GET' ? req.body : undefined,
      });
      next();
    });

    // Static files
    this.app.use('/uploads', express.static(this.config.uploadDir));
  }

  /**
   * Setup routes
   */
  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (req: Request, res: Response) => {
      res.json({
        success: true,
        data: {
          status: 'healthy',
          timestamp: new Date().toISOString(),
          uptime: process.uptime(),
          version: process.env.npm_package_version || '1.0.0',
        },
      });
    });

    // API routes
    this.app.use('/api/auth', this.getAuthRoutes());
    this.app.use('/api/users', this.authenticateToken, this.getUserRoutes());
    this.app.use('/api/guilds', this.authenticateToken, this.getGuildRoutes());
    this.app.use(
      '/api/rankings',
      this.authenticateToken,
      this.getRankingRoutes(),
    );
    this.app.use('/api/badges', this.authenticateToken, this.getBadgeRoutes());
    this.app.use(
      '/api/presence',
      this.authenticateToken,
      this.getPresenceRoutes(),
    );
    this.app.use('/api/music', this.authenticateToken, this.getMusicRoutes());
    this.app.use('/api/games', this.authenticateToken, this.getGameRoutes());
    this.app.use('/api/clips', this.authenticateToken, this.getClipRoutes());
    this.app.use('/api/stats', this.authenticateToken, this.getStatsRoutes());

    // Catch all
    this.app.use('*', (req: Request, res: Response) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
      });
    });
  }

  /**
   * Setup error handling
   */
  private setupErrorHandling(): void {
    this.app.use(
      (error: Error, req: Request, res: Response, next: NextFunction) => {
        this.logger.error('API Error:', error);

        if (error instanceof multer.MulterError) {
          if ((error as any).code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
              success: false,
              error: 'File too large',
            });
          }
        }

        return res.status(500).json({
          success: false,
          error: 'Internal server error',
        });
      },
    );
  }

  /**
   * Authentication middleware
   */
  private authenticateToken = async (
    req: AuthenticatedRequest,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader && authHeader.split(' ')[1];

      if (!token) {
        res.status(401).json({
          success: false,
          error: 'Access token required',
        });
        return;
      }

      const decoded = jwt.verify(token, this.config.jwtSecret) as any;

      // Get user from database
      const user = await this.database.client.user.findUnique({
        where: { id: decoded.userId },
        include: {
          guilds: {
            include: {
              guild: true
            }
          }
        }
      });

      if (!user) {
        res.status(401).json({
          success: false,
          error: 'Invalid token'
        });
        return;
      }

      // Get Discord user info
      const discordUser = await this.client.users.fetch(user.id).catch(() => null);
      // Get first active guild from UserGuild relation
       const primaryUserGuild = user.guilds.find(ug => ug.isActive) || user.guilds[0];
      const guildId = primaryUserGuild?.guildId || '';
      const guild = guildId ? this.client.guilds.cache.get(guildId) : null;
      const member = guild ? await guild.members.fetch(user.id).catch(() => null) : null;

      req.user = {
        id: user.id,
        guildId: guildId,
        username: discordUser?.username || user.username,
        discriminator: discordUser?.discriminator || '0000',
        avatar: discordUser?.avatar || undefined,
        roles: member ? member.roles.cache.map(role => role.id) : [],
        permissions: member ? member.permissions.toArray() : []
      };

      next();
    } catch (error) {
      res.status(401).json({
        success: false,
        error: 'Invalid token',
      });
    }
  };

  /**
   * Auth routes
   */
  private getAuthRoutes(): express.Router {
    const router = express.Router();

    // Discord OAuth callback
    router.post('/discord', async (req: Request, res: Response) => {
      try {
        const { code, guildId } = req.body;

        if (!code || !guildId) {
          return res.status(400).json({
            success: false,
            error: 'Code and guildId are required',
          });
        }

        // Exchange code for access token (simplified)
        // In production, implement proper Discord OAuth flow
        const token = jwt.sign(
          { userId: 'temp-user-id', guildId },
          this.config.jwtSecret,
          { expiresIn: this.config.jwtExpiresIn } as jwt.SignOptions,
        );

        return res.json({
          success: true,
          data: {
            token,
            expiresIn: this.config.jwtExpiresIn,
          },
        });
      } catch (error) {
        this.logger.error('Discord auth error:', error);
        return res.status(500).json({
          success: false,
          error: 'Authentication failed',
        });
      }
    });

    // Refresh token
    router.post('/refresh', async (req: Request, res: Response) => {
      try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
          return res.status(400).json({
            success: false,
            error: 'Refresh token required',
          });
        }

        // Verify and generate new token
        const decoded = jwt.verify(refreshToken, this.config.jwtSecret) as any;

        const newToken = jwt.sign(
          { userId: decoded.userId, guildId: decoded.guildId },
          this.config.jwtSecret,
          { expiresIn: this.config.jwtExpiresIn } as jwt.SignOptions,
        );

        return res.json({
          success: true,
          data: {
            token: newToken,
            expiresIn: this.config.jwtExpiresIn,
          },
        });
      } catch (error) {
        return res.status(401).json({
          success: false,
          error: 'Invalid refresh token',
        });
      }
    });

    return router;
  }

  /**
   * User routes
   */
  private getUserRoutes(): express.Router {
    const router = express.Router();

    // Get current user
    router.get('/me', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const user = await this.database.client.user.findUnique({
          where: { id: req.user!.id }
        });

        if (!user) {
          return res.status(404).json({
            success: false,
            error: 'User not found'
          });
        }

        return res.json({
          success: true,
          data: {
            ...user,
            activeGuilds: [] // TODO: Add guilds relation to User model
          }
        });
      } catch (error) {
        this.logger.error('Get user error:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to get user data',
        });
      }
    });

    // Update user profile
    router.put('/me', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { pubgUsername, pubgPlatform } = req.body;

        const updatedUser = await this.database.client.user.update({
          where: { id: req.user!.id },
          data: {
            pubgUsername,
            pubgPlatform,
            updatedAt: new Date()
          }
        });

        res.json({
          success: true,
          data: updatedUser
        });
      } catch (error) {
        this.logger.error('Update user error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to update user',
        });
      }
    });

    // Get user stats
    router.get(
      '/me/stats',
      async (req: AuthenticatedRequest, res: Response) => {
        try {
          const stats = await this.database.client.userStats.findUnique({
            where: {
              userId: req.user!.id
            }
          });

          res.json({
            success: true,
            data: stats
          });
        } catch (error) {
          this.logger.error('Get user stats error:', error);
          res.status(500).json({
            success: false,
            error: 'Failed to get user stats',
          });
        }
      },
    );

    return router;
  }

  /**
   * Guild routes
   */
  private getGuildRoutes(): express.Router {
    const router = express.Router();

    // Get guild info
    router.get(
      '/:guildId',
      async (req: AuthenticatedRequest, res: Response) => {
        try {
          const { guildId } = req.params;

          if (guildId !== req.user!.guildId) {
            return res.status(403).json({
              success: false,
              error: 'Access denied',
            });
          }

          const guild = await this.database.client.guild.findUnique({
            where: { id: guildId },
            include: {
              config: true,
              users: {
                where: { isActive: true },
                take: 10,
                orderBy: {
                  joinedAt: 'desc',
                },
                include: {
                  user: {
                    select: {
                      id: true,
                      username: true,
                      discriminator: true,
                      avatar: true,
                      level: true,
                      totalXp: true,
                      lastSeen: true
                    }
                  }
                }
              },
            },
          });

          return res.json({
            success: true,
            data: guild,
          });
        } catch (error) {
          this.logger.error('Get guild error:', error);
          return res.status(500).json({
            success: false,
            error: 'Failed to get guild data',
          });
        }
      },
    );

    // Get guild members
    router.get(
      '/:guildId/members',
      async (req: AuthenticatedRequest, res: Response) => {
        try {
          const { guildId } = req.params;
          const { page = 1, limit = 20 } = req.query;

          if (guildId !== req.user!.guildId) {
            return res.status(403).json({
              success: false,
              error: 'Access denied',
            });
          }

          const skip = (Number(page) - 1) * Number(limit);

          const [members, total] = await Promise.all([
            this.database.client.userGuild.findMany({
              where: { guildId },
              include: {
                user: {
                   include: {
                     stats: true
                   }
                 }
              },
              skip,
              take: Number(limit),
              orderBy: {
                joinedAt: 'desc'
              }
            }),
            this.database.client.userGuild.count({
              where: { guildId }
            })
          ]);

          return res.json({
            success: true,
            data: members,
            pagination: {
              page: Number(page),
              limit: Number(limit),
              total,
              totalPages: Math.ceil(total / Number(limit)),
            },
          });
        } catch (error) {
          this.logger.error('Get guild members error:', error);
          return res.status(500).json({
            success: false,
            error: 'Failed to get guild members',
          });
        }
      },
    );

    return router;
  }

  /**
   * Ranking routes
   */
  private getRankingRoutes(): express.Router {
    const router = express.Router();

    // Get PUBG rankings
    router.get(
      '/pubg/:period',
      async (req: AuthenticatedRequest, res: Response) => {
        try {
          const { period } = req.params;
          const { limit = 50 } = req.query;

          if (!period || !['daily', 'weekly', 'monthly'].includes(period)) {
            return res.status(400).json({
              success: false,
              error: 'Invalid period',
            });
          }

          // Create RankingPeriod object based on period string
          let rankingPeriod;
          const now = new Date();
          switch (period) {
          case 'daily':
            rankingPeriod = {
              type: 'daily' as const,
              startDate: new Date(now.getTime() - 24 * 60 * 60 * 1000),
              endDate: now,
            };
            break;
          case 'weekly':
            rankingPeriod = {
              type: 'weekly' as const,
              startDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
              endDate: now,
            };
            break;
          case 'monthly':
            rankingPeriod = {
              type: 'monthly' as const,
              startDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
              endDate: now,
            };
            break;
          default:
            return res.status(400).json({
              success: false,
              error: 'Invalid period',
            });
          }

          const ranking = this.rankingService.getPUBGRanking(
            req.user!.guildId,
            rankingPeriod,
            undefined, // gameMode - use default
            'rankPoints', // sortBy - use default
            Number(limit),
          );

          return res.json({
            success: true,
            data: ranking,
          });
        } catch (error) {
          this.logger.error('Get PUBG ranking error:', error);
          return res.status(500).json({
            success: false,
            error: 'Failed to get PUBG ranking',
          });
        }
      },
    );

    // Get internal rankings
    router.get(
      '/internal/:period',
      async (req: AuthenticatedRequest, res: Response) => {
        try {
          const { period } = req.params;
          const { limit = 50 } = req.query;

          if (!period || !['daily', 'weekly', 'monthly'].includes(period)) {
            return res.status(400).json({
              success: false,
              error: 'Invalid period',
            });
          }

          // Create RankingPeriod object based on period string
          let rankingPeriod;
          const now = new Date();
          switch (period) {
          case 'daily':
            rankingPeriod = {
              type: 'daily' as const,
              startDate: new Date(now.getTime() - 24 * 60 * 60 * 1000),
              endDate: now,
            };
            break;
          case 'weekly':
            rankingPeriod = {
              type: 'weekly' as const,
              startDate: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
              endDate: now,
            };
            break;
          case 'monthly':
            rankingPeriod = {
              type: 'monthly' as const,
              startDate: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
              endDate: now,
            };
            break;
          default:
            return res.status(400).json({
              success: false,
              error: 'Invalid period',
            });
          }

          const ranking = this.rankingService.getInternalRanking(
            req.user!.guildId,
            rankingPeriod,
            'level', // sortBy - use default
            Number(limit),
          );

          return res.json({
            success: true,
            data: ranking,
          });
        } catch (error) {
          this.logger.error('Get internal ranking error:', error);
          return res.status(500).json({
            success: false,
            error: 'Failed to get internal ranking',
          });
        }
      },
    );

    return router;
  }

  /**
   * Badge routes
   */
  private getBadgeRoutes(): express.Router {
    const router = express.Router();

    // Get user badges
    router.get(
      '/user/:userId',
      async (req: AuthenticatedRequest, res: Response) => {
        try {
          const { userId } = req.params;

          const badges = await this.database.client.userBadge.findMany({
            where: {
              userId,
            },
            include: {
              badge: true,
            },
            orderBy: {
              earnedAt: 'desc',
            },
          });

          res.json({
            success: true,
            data: badges,
          });
        } catch (error) {
          this.logger.error('Get user badges error:', error);
          res.status(500).json({
            success: false,
            error: 'Failed to get user badges',
          });
        }
      },
    );

    // Get all badges
    router.get('/', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const badges = await this.database.client.badge.findMany({
          orderBy: {
            category: 'asc',
          },
        });

        res.json({
          success: true,
          data: badges,
        });
      } catch (error) {
        this.logger.error('Get badges error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get badges',
        });
      }
    });

    return router;
  }

  /**
   * Presence routes
   */
  private getPresenceRoutes(): express.Router {
    const router = express.Router();

    // Check in
    router.post(
      '/checkin',
      async (req: AuthenticatedRequest, res: Response) => {
        try {
          const result = await this.presenceService.checkIn(
            req.user!.guildId,
            req.user!.id,
          );

          res.json({
            success: result.success,
            message: result.message,
            data: result.session,
          });
        } catch (error) {
          this.logger.error('Check in error:', error);
          res.status(500).json({
            success: false,
            error: 'Failed to check in',
          });
        }
      },
    );

    // Check out
    router.post(
      '/checkout',
      async (req: AuthenticatedRequest, res: Response) => {
        try {
          const result = await this.presenceService.checkOut(
            req.user!.guildId,
            req.user!.id,
          );

          res.json({
            success: result.success,
            message: result.message,
            data: result.session,
          });
        } catch (error) {
          this.logger.error('Check out error:', error);
          res.status(500).json({
            success: false,
            error: 'Failed to check out',
          });
        }
      },
    );

    // Get user presence stats
    router.get(
      '/stats/:userId',
      async (req: AuthenticatedRequest, res: Response) => {
        try {
          const { userId } = req.params;

          if (!userId) {
            return res.status(400).json({
              success: false,
              error: 'User ID is required',
            });
          }

          const stats = this.presenceService.getUserStats(
            req.user!.guildId,
            userId,
          );

          return res.json({
            success: true,
            data: stats,
          });
        } catch (error) {
          this.logger.error('Get presence stats error:', error);
          return res.status(500).json({
            success: false,
            error: 'Failed to get presence stats',
          });
        }
      },
    );

    return router;
  }

  /**
   * Music routes
   */
  private getMusicRoutes(): express.Router {
    const router = express.Router();

    // Get current queue
    router.get(
      '/queue/:guildId',
      async (req: AuthenticatedRequest, res: Response) => {
        try {
          const { guildId } = req.params;

          if (guildId !== req.user!.guildId) {
            return res.status(403).json({
              success: false,
              error: 'Access denied',
            });
          }

          const queue = this.musicService.getQueue(guildId);

          return res.json({
            success: true,
            data: queue,
          });
        } catch (error) {
          this.logger.error('Get music queue error:', error);
          return res.status(500).json({
            success: false,
            error: 'Failed to get music queue',
          });
        }
      },
    );

    // Add track to queue
    router.post(
      '/queue/:guildId/add',
      async (req: AuthenticatedRequest, res: Response) => {
        try {
          const { guildId } = req.params;
          const { query } = req.body;

          if (guildId !== req.user!.guildId) {
            return res.status(403).json({
              success: false,
              error: 'Access denied',
            });
          }

          const result = await this.musicService.addTrack(
            guildId,
            query,
            req.user!.id,
          );

          return res.json({
            success: result.success,
            message: result.message,
            data: result.track,
          });
        } catch (error) {
          this.logger.error('Add track error:', error);
          return res.status(500).json({
            success: false,
            error: 'Failed to add track',
          });
        }
      },
    );

    return router;
  }

  /**
   * Game routes
   */
  private getGameRoutes(): express.Router {
    const router = express.Router();

    // Get active games
    router.get(
      '/active/:guildId',
      async (req: AuthenticatedRequest, res: Response) => {
        try {
          const { guildId } = req.params;

          if (guildId !== req.user!.guildId) {
            return res.status(403).json({
              success: false,
              error: 'Access denied',
            });
          }

          const games = this.gameService.getActiveChallenges();

          return res.json({
            success: true,
            data: games,
          });
        } catch (error) {
          this.logger.error('Get active games error:', error);
          return res.status(500).json({
            success: false,
            error: 'Failed to get active games',
          });
        }
      },
    );

    return router;
  }

  /**
   * Clip routes
   */
  private getClipRoutes(): express.Router {
    const router = express.Router();

    // Upload clip
    router.post(
      '/upload',
      this.upload.single('clip'),
      async (req: AuthenticatedRequest, res: Response) => {
        try {
          if (!req.file) {
            return res.status(400).json({
              success: false,
              error: 'No file uploaded',
            });
          }

          const { title, description, gameMode, tags } = req.body;

          const fileBuffer = fs.readFileSync(req.file.path);

          const result = await this.clipService.uploadClip(
            req.user!.guildId,
            req.user!.id,
            fileBuffer,
            req.file.originalname,
            title,
            description,
            gameMode,
            tags ? JSON.parse(tags) : undefined,
          );

          // Clean up uploaded file
          fs.unlinkSync(req.file.path);

          return res.json({
            success: result.success,
            message: result.message,
            data: { clipId: result.clipId },
          });
        } catch (error) {
          this.logger.error('Upload clip error:', error);
          return res.status(500).json({
            success: false,
            error: 'Failed to upload clip',
          });
        }
      },
    );

    // Get clips
    router.get(
      '/:guildId',
      async (req: AuthenticatedRequest, res: Response) => {
        try {
          const { guildId } = req.params;
          const { status, limit = 20, offset = 0 } = req.query;

          if (guildId !== req.user!.guildId) {
            return res.status(403).json({
              success: false,
              error: 'Access denied',
            });
          }

          const clips = this.clipService.getClips(
            guildId,
            status as any,
            Number(limit),
            Number(offset),
          );

          return res.json({
            success: true,
            data: clips,
          });
        } catch (error) {
          this.logger.error('Get clips error:', error);
          return res.status(500).json({
            success: false,
            error: 'Failed to get clips',
          });
        }
      },
    );

    return router;
  }

  /**
   * Stats routes
   */
  private getStatsRoutes(): express.Router {
    const router = express.Router();

    // Get guild stats
    router.get(
      '/guild/:guildId',
      async (req: AuthenticatedRequest, res: Response) => {
        try {
          const { guildId } = req.params;

          if (guildId !== req.user!.guildId) {
            return res.status(403).json({
              success: false,
              error: 'Access denied',
            });
          }

          const stats = await this.getGuildStats(guildId);

          return res.json({
            success: true,
            data: stats,
          });
        } catch (error) {
          this.logger.error('Get guild stats error:', error);
          return res.status(500).json({
            success: false,
            error: 'Failed to get guild stats',
          });
        }
      },
    );

    return router;
  }

  /**
   * Get guild statistics
   */
  private async getGuildStats(guildId: string): Promise<any> {
    try {
      // Get guild members through UserGuild relation
      const guildMembers = await this.database.client.userGuild.findMany({
        where: { 
          guildId,
          isActive: true 
        },
        include: {
          user: {
            include: {
              stats: true,
              badges: true
            }
          }
        }
      });

      // Calculate active users (users who have been seen in the last 7 days)
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      
      const activeUsers = guildMembers.filter(member => 
        member.user.lastSeen && member.user.lastSeen > sevenDaysAgo
      ).length;

      // Calculate totals for guild members
      const totalXP = guildMembers.reduce((sum, member) => 
        sum + (member.user.totalXp || 0), 0
      );
      
      const totalCoins = guildMembers.reduce((sum, member) => 
        sum + (member.user.coins || 0), 0
      );
      
      const totalMessages = guildMembers.reduce((sum, member) => 
        sum + 0, 0 // TODO: Add messagesCount field to User model
      );

      // Count badges for guild members
      const badgeCount = guildMembers.reduce((sum, member) => 
        sum + (member.user.badges?.length || 0), 0
      );

      // Get other statistics
      const [clipCount, presenceCount, quizCount] = await Promise.all([
        this.database.client.clip.count({ where: { guildId } }),
        this.database.client.presence.count({ 
          where: { 
            metadata: {
              path: ['guildId'],
              equals: guildId
            }
          }
        }),
        this.database.client.quizResult.count() // TODO: Add guildId field to QuizResult model
      ]);

      return {
        users: {
          total: guildMembers.length,
          active: activeUsers,
        },
        economy: {
          totalXP,
          totalCoins,
          totalMessages,
        },
        engagement: {
          badges: badgeCount,
          clips: clipCount,
          presenceSessions: presenceCount,
          quizzes: quizCount,
        },
      };
    } catch (error) {
      this.logger.error('Failed to get guild stats:', error);
      // Return empty stats on error
      return {
        users: { total: 0, active: 0 },
        economy: { totalXP: 0, totalCoins: 0, totalMessages: 0 },
        engagement: { badges: 0, clips: 0, presenceSessions: 0, quizzes: 0 },
      };
    }
  }

  /**
   * Start the API server
   */
  public async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        this.server = this.app.listen(
          this.config.port,
          this.config.host,
          () => {
            this.logger.info(
              `API server started on ${this.config.host}:${this.config.port}`,
            );
            resolve();
          },
        );

        this.server.on('error', (error) => {
          this.logger.error('API server error:', error);
          reject(error);
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Stop the API server
   */
  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          this.logger.info('API server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  /**
   * Get server info
   */
  public getServerInfo(): any {
    return {
      port: this.config.port,
      host: this.config.host,
      running: this.server !== null,
    };
  }
}
