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
import { Server as SocketIOServer } from 'socket.io';
import * as jwt from 'jsonwebtoken';
import * as bcrypt from 'bcryptjs';
import multer from 'multer';
import * as path from 'path';
import * as fs from 'fs';
import session from 'express-session';
import { SecurityService } from './security.service';

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
  private io: SocketIOServer | null = null;
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
  private securityService: SecurityService;

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
    this.securityService = new SecurityService(this.database);

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

    // Session middleware
    this.app.use(session({
      secret: this.config.jwtSecret,
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: process.env.NODE_ENV === 'production',
        httpOnly: true,
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      }
    }));

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

    // Security middleware for bot detection
    this.app.use('/api/auth/register', (req: Request, res: Response, next: NextFunction) => {
      const securityCheck = this.securityService.analyzeRequest(req);
      
      if (securityCheck.isBot) {
        return res.status(429).json({
          success: false,
          error: 'Suspicious activity detected. Please try again later.',
          requiresCaptcha: true,
          reasons: securityCheck.reasons
        });
      }
      
      // Add security info to request
      (req as any).securityCheck = securityCheck;
      return next();
    });

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
    
    // Development routes (no auth required)
    if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
      this.app.use('/api/dev', this.getDevRoutes());
    }
    
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
   * Development routes (no auth required)
   */
  private getDevRoutes(): express.Router {
    const router = express.Router();

    // Get guild stats without auth for development
    router.get('/stats/:guildId', async (req: Request, res: Response) => {
      try {
        const { guildId } = req.params;
        if (!guildId) {
          return res.status(400).json({
            success: false,
            error: 'Guild ID is required'
          });
        }
        const stats = await this.getGuildStats(guildId);
        
        return res.json({
          success: true,
          data: stats
        });
      } catch (error) {
        this.logger.error('Error fetching dev stats:', error);
        return res.status(500).json({
          success: false,
          error: 'Internal server error'
        });
      }
    });

    // Get guild info without auth for development
    router.get('/guild/:guildId', async (req: Request, res: Response) => {
      try {
        const { guildId } = req.params;
        
        // Get real guild data from database
        const guild = await this.database.client.guild.findUnique({
          where: { id: guildId },
          include: {
            config: true,
            users: {
              where: { isActive: true },
              take: 10, // Limit to first 10 users for performance
              include: {
                user: {
                  select: {
                    id: true,
                    username: true,
                    discriminator: true,
                    avatar: true,
                    level: true,
                    totalXp: true,
                    coins: true,
                    lastSeen: true,
                  }
                }
              },
              orderBy: {
                user: {
                  lastSeen: 'desc'
                }
              }
            }
          }
        });

        if (!guild) {
          return res.status(404).json({
            success: false,
            error: 'Guild not found'
          });
        }

        // Get member count
        const memberCount = await this.database.client.userGuild.count({
          where: { guildId, isActive: true }
        });

        const guildData = {
          id: guild.id,
          name: guild.name,
          icon: guild.icon,
          memberCount,
          config: guild.config?.config || {},
          users: guild.users.map(userGuild => ({
            user: {
              ...userGuild.user,
              joinedAt: userGuild.joinedAt.toISOString()
            },
            isActive: userGuild.isActive,
            joinedAt: userGuild.joinedAt.toISOString()
          }))
        };

        return res.json({
          success: true,
          data: guildData
        });
      } catch (error) {
        this.logger.error('Error fetching dev guild:', error);
        return res.status(500).json({
          success: false,
          error: 'Internal server error'
        });
      }
    });

    // Get commands without auth for development
    router.get('/commands', async (req: Request, res: Response) => {
      try {
        // Get real commands from the bot's command manager
        const commandsData = [];
        
        // If bot client is available, get real command data
        if (this.client?.commands) {
          for (const [name, command] of this.client.commands) {
            // Get command statistics from database if available
            let usageCount = 0;
            let lastUsed = null;
            let successRate = 100;
            let avgResponseTime = 150;
            
            try {
              // Try to get real stats from audit logs
              const commandLogs = await this.database.client.auditLog.findMany({
                where: {
                  action: 'command_executed',
                  metadata: JSON.stringify({
                    command: name
                  })
                },
                orderBy: {
                  createdAt: 'desc'
                },
                take: 100
              });
              
              usageCount = commandLogs.length;
              if (commandLogs.length > 0 && commandLogs[0]) {
                lastUsed = commandLogs[0].createdAt;
                // Calculate success rate based on error logs
                const errorLogs = commandLogs.filter(log => 
                  log.metadata && typeof log.metadata === 'object' && 
                  'error' in log.metadata
                );
                successRate = Math.max(0, ((commandLogs.length - errorLogs.length) / commandLogs.length) * 100);
              }
            } catch (dbError) {
              // Use default values if database query fails
              usageCount = 0;
              lastUsed = new Date();
              successRate = 100;
            }
            
            commandsData.push({
              id: name,
              name: name,
              description: 'description' in command.data ? command.data.description : 'No description available',
              category: command.category?.toUpperCase() || 'GENERAL',
              usageCount,
              successRate: Math.round(successRate * 100) / 100,
              avgResponseTime: avgResponseTime || 100,
              lastUsed: lastUsed ? lastUsed.toISOString() : new Date().toISOString(),
              enabled: !command.disabled,
              premium: command.premium || false,
              aliases: command.aliases || []
            });
          }
        } else {
          // Fallback to complete command list if bot is not available
          const basicCommands = [
            // General Commands
            { name: 'help', description: 'Mostra ajuda sobre comandos', category: 'GENERAL' },
            { name: 'profile', description: 'Mostra perfil do usuário', category: 'GENERAL' },
            { name: 'badges', description: 'Sistema de emblemas', category: 'GENERAL' },
            { name: 'daily', description: 'Recompensa diária', category: 'GENERAL' },
            { name: 'economy', description: 'Sistema de economia', category: 'GENERAL' },
            { name: 'clips', description: 'Sistema de clipes', category: 'GENERAL' },
            { name: 'challenge', description: 'Desafios diários', category: 'GENERAL' },
            { name: 'quiz', description: 'Sistema de quiz', category: 'GENERAL' },
            { name: 'minigame', description: 'Mini jogos', category: 'GENERAL' },
            // PUBG Commands
            { name: 'register', description: 'Registra conta PUBG', category: 'PUBG' },
            { name: 'ranking', description: 'Sistema de ranking PUBG', category: 'PUBG' },
            // Music Commands
            { name: 'play', description: 'Toca música', category: 'MUSIC' },
            { name: 'queue', description: 'Gerencia fila de música', category: 'MUSIC' },
            // Admin Commands
            { name: 'onboarding', description: 'Sistema de boas-vindas', category: 'ADMIN' },
            { name: 'bootstrap', description: 'Configuração inicial do servidor', category: 'ADMIN' }
          ];
          
          for (const cmd of basicCommands) {
            commandsData.push({
              id: cmd.name,
              name: cmd.name,
              description: cmd.description,
              category: cmd.category,
              usageCount: 0,
              successRate: 100,
              avgResponseTime: 100,
              lastUsed: new Date().toISOString(),
              enabled: true,
              premium: false,
              aliases: []
            });
          }
        }

        res.json({
          success: true,
          data: commandsData
        });
      } catch (error) {
        this.logger.error('Error fetching dev commands:', error);
        res.status(500).json({
          success: false,
          error: 'Internal server error'
        });
      }
    });

    // Generate CAPTCHA
    router.get('/captcha', (req: Request, res: Response) => {
      try {
        const captcha = this.securityService.generateCaptcha();
        
        res.json({
          success: true,
          data: {
            id: captcha.id,
            svg: captcha.svg
          }
        });
      } catch (error) {
        this.logger.error('CAPTCHA generation error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to generate CAPTCHA'
        });
      }
    });

    // Verify CAPTCHA
    router.post('/captcha/verify', (req: Request, res: Response) => {
      try {
        const { captchaId, answer } = req.body;
        
        if (!captchaId || !answer) {
          return res.status(400).json({
            success: false,
            error: 'CAPTCHA ID and answer are required'
          });
        }
        
        const isValid = this.securityService.verifyCaptcha(captchaId, answer);
        
        return res.json({
          success: true,
          data: { valid: isValid }
        });
      } catch (error) {
        this.logger.error('CAPTCHA verification error:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to verify CAPTCHA'
        });
      }
    });

    // Setup 2FA
    router.post('/2fa/setup', this.authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
      try {
        const setup = await this.securityService.setup2FA(req.user!.id);
        
        res.json({
          success: true,
          data: {
            qrCode: setup.qrCode,
            backupCodes: setup.backupCodes
          }
        });
      } catch (error) {
        this.logger.error('2FA setup error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to setup 2FA'
        });
      }
    });

    // Enable 2FA
    router.post('/2fa/enable', this.authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { token } = req.body;
        
        if (!token) {
          return res.status(400).json({
            success: false,
            error: '2FA token is required'
          });
        }
        
        const success = await this.securityService.enable2FA(req.user!.id, token);
        
        if (success) {
          return res.json({
            success: true,
            message: '2FA enabled successfully'
          });
        } else {
          return res.status(400).json({
            success: false,
            error: 'Invalid 2FA token'
          });
        }
      } catch (error) {
        this.logger.error('2FA enable error:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to enable 2FA'
        });
      }
    });

    // Disable 2FA
    router.post('/2fa/disable', this.authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
      try {
        await this.securityService.disable2FA(req.user!.id);
        
        res.json({
          success: true,
          message: '2FA disabled successfully'
        });
      } catch (error) {
        this.logger.error('2FA disable error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to disable 2FA'
        });
      }
    });

    // Verify 2FA
    router.post('/2fa/verify', this.authenticateToken, async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { token } = req.body;
        
        if (!token) {
          return res.status(400).json({
            success: false,
            error: '2FA token is required'
          });
        }
        
        const isValid = await this.securityService.verify2FA(req.user!.id, token);
        
        return res.json({
          success: true,
          data: { valid: isValid }
        });
      } catch (error) {
        this.logger.error('2FA verification error:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to verify 2FA'
        });
      }
    });

    return router;
  }

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

        // For development, create a mock user
        let userId = 'dev-user-' + Date.now();
        let userData = {
          id: userId,
          username: 'DevUser',
          discriminator: '0001',
          avatar: null,
          guildId: guildId
        };

        // In production, implement proper Discord OAuth flow:
        // 1. Exchange code for access token with Discord
        // 2. Get user info from Discord API
        // 3. Check if user has access to the guild
        // 4. Create or update user in database
        
        if (process.env.NODE_ENV === 'production') {
          // Exchange code for access token with Discord
          const discordResponse = await fetch('https://discord.com/api/oauth2/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: process.env.DISCORD_CLIENT_ID!,
              client_secret: process.env.DISCORD_CLIENT_SECRET!,
              grant_type: 'authorization_code',
              code: code,
              redirect_uri: process.env.DISCORD_REDIRECT_URI!,
            })
          });

          if (!discordResponse.ok) {
            throw new Error('Failed to exchange code for token');
          }

          const tokenData = await discordResponse.json() as any;

          // Get user info from Discord API
          const userResponse = await fetch('https://discord.com/api/users/@me', {
            headers: {
              'Authorization': `Bearer ${tokenData.access_token}`
            }
          });

          if (!userResponse.ok) {
            throw new Error('Failed to get user info from Discord');
          }

          const discordUser = await userResponse.json() as any;

          // Check if user has access to the guild
          const guildMemberResponse = await fetch(`https://discord.com/api/guilds/${guildId}/members/${discordUser.id}`, {
            headers: {
              'Authorization': `Bot ${process.env.DISCORD_BOT_TOKEN}`
            }
          });

          if (!guildMemberResponse.ok) {
            return res.status(403).json({
              success: false,
              error: 'User is not a member of this guild'
            });
          }

          // Update userData with real Discord data
          userData = {
            id: discordUser.id,
            username: discordUser.username,
            discriminator: discordUser.discriminator || '0001',
            avatar: discordUser.avatar,
            guildId: guildId
          };
          userId = discordUser.id;
        }

        // Create or update user in database
        try {
          const user = await this.database.client.user.upsert({
            where: { id: userId },
            update: {
              username: userData.username,
              updatedAt: new Date()
            },
            create: {
              id: userId,
              username: userData.username,
              discriminator: userData.discriminator,
              createdAt: new Date(),
              updatedAt: new Date()
            }
          });

          // Create or update user-guild relationship
          await this.database.client.userGuild.upsert({
            where: {
              userId_guildId: {
                userId: userId,
                guildId: guildId
              }
            },
            update: {
              isActive: true
            },
            create: {
              userId: userId,
              guildId: guildId,
              isActive: true,
              joinedAt: new Date()
            }
          });
        } catch (dbError) {
          this.logger.error('Database error during auth:', dbError);
          // Continue with mock data for development
        }

        // Generate JWT token
        const token = jwt.sign(
          { 
            userId: userId, 
            guildId: guildId,
            username: userData.username,
            discriminator: userData.discriminator
          },
          this.config.jwtSecret,
          { expiresIn: this.config.jwtExpiresIn } as jwt.SignOptions,
        );

        // Generate refresh token
        const refreshToken = jwt.sign(
          { 
            userId: userId, 
            guildId: guildId,
            type: 'refresh'
          },
          this.config.jwtSecret,
          { expiresIn: '30d' } as jwt.SignOptions,
        );

        return res.json({
          success: true,
          data: {
            token,
            refreshToken,
            expiresIn: this.config.jwtExpiresIn,
            user: userData
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

        // Verify refresh token
        const decoded = jwt.verify(refreshToken, this.config.jwtSecret) as any;

        // Check if it's actually a refresh token
        if (decoded.type !== 'refresh') {
          return res.status(401).json({
            success: false,
            error: 'Invalid token type',
          });
        }

        // Get user data from database
        let userData = {
          username: 'DevUser',
          discriminator: '0001'
        };

        try {
          const user = await this.database.client.user.findUnique({
            where: { id: decoded.userId }
          });
          
          if (user) {
            userData.username = user.username;
            userData.discriminator = user.discriminator || '0001';
          }
        } catch (dbError) {
          this.logger.error('Database error during refresh:', dbError);
        }

        // Generate new access token
        const newToken = jwt.sign(
          { 
            userId: decoded.userId, 
            guildId: decoded.guildId,
            username: userData.username,
            discriminator: userData.discriminator
          },
          this.config.jwtSecret,
          { expiresIn: this.config.jwtExpiresIn } as jwt.SignOptions,
        );

        // Generate new refresh token
        const newRefreshToken = jwt.sign(
          { 
            userId: decoded.userId, 
            guildId: decoded.guildId,
            type: 'refresh'
          },
          this.config.jwtSecret,
          { expiresIn: '30d' } as jwt.SignOptions,
        );

        return res.json({
          success: true,
          data: {
            token: newToken,
            refreshToken: newRefreshToken,
            expiresIn: this.config.jwtExpiresIn,
          },
        });
      } catch (error) {
        this.logger.error('Refresh token error:', error);
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

        // Get user's active guilds
        const userGuilds = await this.database.client.userGuild.findMany({
          where: {
            userId: user.id,
            isActive: true
          },
          include: {
            guild: {
              select: {
                id: true,
                name: true,
                icon: true
              }
            }
          }
        });

        const activeGuilds = userGuilds.map(ug => ({
          id: ug.guild.id,
          name: ug.guild.name,
          icon: ug.guild.icon,
          joinedAt: ug.joinedAt.toISOString(),
          isActive: ug.isActive
        }));

        return res.json({
          success: true,
          data: {
            ...user,
            activeGuilds,
            roles: req.user!.roles || [],
            permissions: req.user!.permissions || []
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

    // Get bot activity stats
    router.get('/activity', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const guildId = req.user!.guildId;
        const { period = '7d' } = req.query;

        // Calculate date range based on period
        const now = new Date();
        let startDate: Date;
        
        switch (period) {
          case '1d':
            startDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            break;
          case '7d':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case '30d':
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          default:
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        }

        // Get command usage from audit logs
        const commandLogs = await this.database.client.auditLog.findMany({
          where: {
            guildId,
            action: 'COMMAND_USED',
            createdAt: {
              gte: startDate
            }
          },
          select: {
            metadata: true
          }
        });

        // Process command usage statistics
        const commandStats = new Map<string, number>();
        let totalCommands = 0;
        
        commandLogs.forEach(log => {
          if (log.metadata && typeof log.metadata === 'object' && 'command' in log.metadata) {
            const commandName = (log.metadata as any).command;
            commandStats.set(commandName, (commandStats.get(commandName) || 0) + 1);
            totalCommands++;
          }
        });

        // Get most used commands
        const mostUsedCommands = Array.from(commandStats.entries())
          .sort(([,a], [,b]) => b - a)
          .slice(0, 5)
          .map(([name, count]) => ({ name, count }));

        // Get user activity data
        const [newUsersCount, newBadgesCount, completedQuizzesCount, presenceData] = await Promise.all([
          // New users in period
          this.database.client.userGuild.count({
            where: {
              guildId,
              joinedAt: {
                gte: startDate
              }
            }
          }),
          // New badges earned in period
          this.database.client.userBadge.count({
            where: {
              earnedAt: {
                gte: startDate
              },
              user: {
                guilds: {
                  some: {
                    guildId
                  }
                }
              }
            }
          }),
          // Completed quizzes in period
          this.database.client.gameResult.count({
            where: {
              completedAt: {
                gte: startDate
              },
              user: {
                guilds: {
                  some: {
                    guildId
                  }
                }
              }
            }
          }),
          // Voice activity data
          this.database.client.presence.findMany({
            where: {
              guildId,
              checkInTime: {
                gte: startDate
              },
              type: 'VOICE'
            },
            select: {
              checkInTime: true,
              checkOutTime: true
            }
          })
        ]);

        // Calculate voice minutes
        const voiceMinutes = presenceData.reduce((total, presence) => {
          if (presence.checkOutTime && presence.checkInTime) {
            const duration = presence.checkOutTime.getTime() - presence.checkInTime.getTime();
            return total + Math.floor(duration / (1000 * 60));
          }
          return total;
        }, 0);

        const activityStats = {
          commands: {
            total: totalCommands,
            mostUsed: mostUsedCommands,
          },
          interactions: {
            messages: totalCommands, // Using command usage as proxy for message activity
            reactions: Math.floor(totalCommands * 0.3), // Estimated reactions based on commands
            voiceMinutes,
          },
          growth: {
            newUsers: newUsersCount,
            newBadges: newBadgesCount,
            completedQuizzes: completedQuizzesCount,
          },
        };

        res.json({
          success: true,
          data: activityStats,
        });
      } catch (error) {
        this.logger.error('Get activity stats error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get activity statistics',
        });
      }
    });

    // Get real-time stats
    router.get('/realtime', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const guildId = req.user!.guildId;
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

        // Get real-time data from database
        const [commandsLastHour, activePresences, totalUsers] = await Promise.all([
          // Commands used in the last hour
          this.database.client.auditLog.count({
            where: {
              guildId,
              action: 'COMMAND_USED',
              createdAt: {
                gte: oneHourAgo
              }
            }
          }),
          // Active voice presences
          this.database.client.presence.count({
            where: {
              guildId,
              type: 'VOICE',
              checkOutTime: null // Still active
            }
          }),
          // Total users in guild
          this.database.client.userGuild.count({
            where: {
              guildId
            }
          })
        ]);

        // Get system stats (these would typically come from bot client)
        const systemStats = {
          uptime: process.uptime() * 1000, // Convert to milliseconds
          memoryUsage: Math.round(process.memoryUsage().heapUsed / 1024 / 1024), // MB
          responseTime: 25, // Average response time in ms
        };

        const realtimeStats = {
          online: {
            users: Math.floor(totalUsers * 0.1), // Estimate 10% online
            bots: 1,
            total: Math.floor(totalUsers * 0.1) + 1,
          },
          activity: {
            commandsLastHour,
            messagesLastHour: commandsLastHour * 2, // Estimate messages based on commands
            activeVoiceChannels: Math.max(1, Math.floor(activePresences / 5)), // Estimate channels
          },
          system: systemStats,
        };

        res.json({
          success: true,
          data: realtimeStats,
        });
      } catch (error) {
        this.logger.error('Get realtime stats error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get realtime statistics',
        });
      }
    });

    // Get user engagement stats
    router.get('/engagement', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const guildId = req.user!.guildId;
        const { period = '30d' } = req.query;

        // Calculate date ranges
        const now = new Date();
        let startDate: Date;
        let weekStartDate: Date;
        let dayStartDate: Date;
        
        switch (period) {
          case '7d':
            startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            break;
          case '30d':
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            break;
          case '90d':
            startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
            break;
          default:
            startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        }
        
        weekStartDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
        dayStartDate = new Date(now.getTime() - 24 * 60 * 60 * 1000);

        // Get engagement data from database
        const [activeUsers, dailyActiveUsers, weeklyActiveUsers, clipsUploaded, quizzesCompleted, badgesEarned, presenceData] = await Promise.all([
          // Active users in period (users who used commands or earned badges)
          this.database.client.user.count({
            where: {
              OR: [
                {
                  auditLogs: {
                    some: {
                      guildId,
                      createdAt: {
                        gte: startDate
                      }
                    }
                  }
                },
                {
                  badges: {
                    some: {
                      earnedAt: {
                        gte: startDate
                      }
                    }
                  }
                }
              ]
            }
          }),
          // Daily active users
          this.database.client.user.count({
            where: {
              OR: [
                {
                  auditLogs: {
                    some: {
                      guildId,
                      createdAt: {
                        gte: dayStartDate
                      }
                    }
                  }
                },
                {
                  badges: {
                    some: {
                      earnedAt: {
                        gte: dayStartDate
                      }
                    }
                  }
                }
              ]
            }
          }),
          // Weekly active users
          this.database.client.user.count({
            where: {
              OR: [
                {
                  auditLogs: {
                    some: {
                      guildId,
                      createdAt: {
                        gte: weekStartDate
                      }
                    }
                  }
                },
                {
                  badges: {
                    some: {
                      earnedAt: {
                        gte: weekStartDate
                      }
                    }
                  }
                }
              ]
            }
          }),
          // Clips uploaded in period
          this.database.client.clip.count({
            where: {
              guildId,
              createdAt: {
                gte: startDate
              }
            }
          }),
          // Quizzes completed in period
          this.database.client.gameResult.count({
            where: {
              completedAt: {
                gte: startDate
              },
              user: {
                guilds: {
                  some: {
                    guildId
                  }
                }
              }
            }
          }),
          // Badges earned in period
          this.database.client.userBadge.count({
            where: {
              earnedAt: {
                gte: startDate
              },
              user: {
                guilds: {
                  some: {
                    guildId
                  }
                }
              }
            }
          }),
          // Presence data for session time calculation
          this.database.client.presence.findMany({
            where: {
              guildId,
              checkInTime: {
                gte: startDate
              }
            },
            select: {
              checkInTime: true,
              checkOutTime: true,
              userId: true
            }
          })
        ]);

        // Calculate average session time and returning users
        const userSessions = new Map<string, number>();
        let totalSessionTime = 0;
        let sessionCount = 0;

        presenceData.forEach(presence => {
          if (presence.checkOutTime && presence.checkInTime) {
            const sessionTime = presence.checkOutTime.getTime() - presence.checkInTime.getTime();
            const sessionMinutes = Math.floor(sessionTime / (1000 * 60));
            
            userSessions.set(presence.userId, (userSessions.get(presence.userId) || 0) + sessionMinutes);
            totalSessionTime += sessionMinutes;
            sessionCount++;
          }
        });

        const averageSessionTime = sessionCount > 0 ? Math.floor(totalSessionTime / sessionCount) : 0;
        const returningUsers = userSessions.size;
        const engagementRate = activeUsers > 0 ? Math.floor((returningUsers / activeUsers) * 100) : 0;

        const engagementStats = {
          participation: {
            activeUsers,
            dailyActiveUsers,
            weeklyActiveUsers,
          },
          content: {
            clipsUploaded,
            quizzesCompleted,
            badgesEarned,
          },
          retention: {
            returningUsers,
            averageSessionTime,
            engagementRate,
          },
        };

        res.json({
          success: true,
          data: engagementStats,
        });
      } catch (error) {
        this.logger.error('Get engagement stats error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get engagement statistics',
        });
      }
    });

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

    // Get combined leaderboard
    router.get('/leaderboard', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { type = 'combined', period = 'monthly', limit = 50 } = req.query;

        if (!['daily', 'weekly', 'monthly'].includes(period as string)) {
          return res.status(400).json({
            success: false,
            error: 'Invalid period',
          });
        }

        // Create RankingPeriod object
        const now = new Date();
        let rankingPeriod;
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
        }

        let leaderboard;
        if (type === 'pubg') {
          leaderboard = this.rankingService.getPUBGRanking(
            req.user!.guildId,
            rankingPeriod!,
            undefined,
            'rankPoints',
            Number(limit),
          );
        } else if (type === 'internal') {
          leaderboard = this.rankingService.getInternalRanking(
            req.user!.guildId,
            rankingPeriod!,
            'level',
            Number(limit),
          );
        } else {
          // Combined leaderboard - mix both rankings
          const pubgRanking = this.rankingService.getPUBGRanking(
            req.user!.guildId,
            rankingPeriod!,
            undefined,
            'rankPoints',
            25,
          );
          const internalRanking = this.rankingService.getInternalRanking(
            req.user!.guildId,
            rankingPeriod!,
            'level',
            25,
          );

          leaderboard = {
            pubg: pubgRanking,
            internal: internalRanking,
          };
        }

        return res.json({
          success: true,
          data: leaderboard,
        });
      } catch (error) {
        this.logger.error('Get leaderboard error:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to get leaderboard',
        });
      }
    });

    // Get ranking statistics
    router.get('/stats', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const guildId = req.user!.guildId;

        // Get real ranking statistics from database
        const [pubgStats, internalStats, totalPubgUsers, totalInternalUsers] = await Promise.all([
          // PUBG average stats
          this.database.client.pUBGStats.aggregate({
            where: {
              user: {
                guilds: {
                  some: {
                    guildId
                  }
                }
              }
            },
            _avg: {
              currentRankPoint: true,
              kills: true,
              wins: true
            }
          }),
          // Internal average stats
          this.database.client.userStats.aggregate({
            where: {
              user: {
                guilds: {
                  some: {
                    guildId
                  }
                }
              }
            },
            _avg: {
              voiceTime: true,
              commandsUsed: true
            }
          }),
          // Total PUBG users
          this.database.client.pUBGStats.count({
            where: {
              user: {
                guilds: {
                  some: {
                    guildId
                  }
                }
              }
            }
          }),
          // Total internal users
          this.database.client.userStats.count({
            where: {
              user: {
                guilds: {
                  some: {
                    guildId
                  }
                }
              }
            }
          })
        ]);

        // Get average badge count
        const avgBadgeCount = await this.database.client.userBadge.groupBy({
          by: ['userId'],
          where: {
            user: {
              guilds: {
                some: {
                  guildId
                }
              }
            }
          },
          _count: {
            badgeId: true
          }
        });

        const averageBadges = avgBadgeCount.length > 0 
          ? avgBadgeCount.reduce((sum: number, user: any) => sum + user._count.badgeId, 0) / avgBadgeCount.length 
          : 0;

        res.json({
          success: true,
          data: {
            totalPubgUsers,
            totalInternalUsers,
            averageStats: {
              pubg: {
                rankPoints: Math.round(pubgStats._avg?.currentRankPoint || 0),
                kills: Math.round(pubgStats._avg?.kills || 0),
                wins: Math.round(pubgStats._avg?.wins || 0),
              },
              internal: {
                level: 1, // TODO: Implement level calculation
                experience: 0, // TODO: Implement experience calculation
                badges: Math.round(averageBadges),
              },
            },
          },
        });
      } catch (error) {
        this.logger.error('Get ranking stats error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get ranking statistics',
        });
      }
    });

    // Get user ranking history
    router.get('/history/:userId', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { userId } = req.params;
        const { type = 'both', limit = 30 } = req.query;
        const guildId = req.user!.guildId;

        // Get historical data from RankingSnapshot table
        const snapshots = await this.database.client.rankingSnapshot.findMany({
          where: {
            userId,
            guildId,
            ...(type === 'pubg' ? { pubgRank: { not: null } } : {}),
            ...(type === 'internal' ? { internalRank: { not: null } } : {})
          },
          orderBy: {
            createdAt: 'desc'
          },
          take: Number(limit),
          include: {
            user: {
              select: {
                pubgStats: true,
                stats: true
              }
            }
          }
        });

        // If no snapshots exist, get current user data as fallback
        if (snapshots.length === 0) {
          const currentUser = await this.database.client.user.findUnique({
            where: { id: userId },
            include: {
              pubgStats: true,
              stats: true,
              badges: {
                select: {
                  badgeId: true
                }
              }
            }
          });

          if (currentUser) {
            const currentEntry = {
              date: new Date(),
              period: 'current',
              pubgRank: type !== 'internal' ? 1 : null, // Default rank if no historical data
              pubgStats: type !== 'internal' && currentUser.pubgStats && currentUser.pubgStats.length > 0 ? {
                 rankPoints: currentUser.pubgStats[0]?.currentRankPoint || 0,
                 kills: currentUser.pubgStats[0]?.kills || 0,
                 wins: currentUser.pubgStats[0]?.wins || 0,
               } : null,
              internalRank: type !== 'pubg' ? 1 : null, // Default rank if no historical data
              internalStats: type !== 'pubg' && currentUser.stats ? {
                level: 1, // TODO: Implement level calculation
                experience: 0, // TODO: Implement experience from user XP
                badges: currentUser.badges.length,
              } : null,
            };

            return res.json({
              success: true,
              data: [currentEntry],
            });
          }

          // If no user found, return empty data
          return res.json({
            success: true,
            data: [],
          });
        }

        // Transform snapshots to history format
        const userHistory = snapshots.map((snapshot: any) => ({
          date: snapshot.createdAt,
          period: snapshot.period,
          pubgRank: type !== 'internal' ? snapshot.pubgRank : null,
          pubgStats: type !== 'internal' && snapshot.user.pubgStats && snapshot.user.pubgStats.length > 0 ? {
             rankPoints: snapshot.user.pubgStats[0]?.currentRankPoint || 0,
             kills: snapshot.user.pubgStats[0]?.kills || 0,
             wins: snapshot.user.pubgStats[0]?.wins || 0,
           } : null,
          internalRank: type !== 'pubg' ? snapshot.internalRank : null,
          internalStats: type !== 'pubg' && snapshot.user.stats ? {
            level: 1, // TODO: Implement level calculation
            experience: 0, // TODO: Implement experience from user XP
            badges: snapshot.badgeCount || 0,
          } : null,
        }));

        return res.json({
          success: true,
          data: userHistory,
        });
      } catch (error) {
        this.logger.error('Get ranking history error:', error);
        return res.status(500).json({
          success: false,
          error: 'Failed to get ranking history',
        });
      }
    });

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

    // Get badge leaderboard
    router.get('/leaderboard', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { limit = 50 } = req.query;

        const leaderboard = await this.database.client.user.findMany({
          select: {
            id: true,
            username: true,
            badges: {
              include: {
                badge: true,
              },
            },
          },
          orderBy: {
            badges: {
              _count: 'desc',
            },
          },
          take: Number(limit),
        });

        const formattedLeaderboard = leaderboard.map((user, index) => ({
          rank: index + 1,
          userId: user.id,
          username: user.username,
          badgeCount: user.badges.length,
          badges: user.badges.map(ub => ub.badge),
        }));

        res.json({
          success: true,
          data: formattedLeaderboard,
        });
      } catch (error) {
        this.logger.error('Get badge leaderboard error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get badge leaderboard',
        });
      }
    });

    // Get badge statistics
    router.get('/stats', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const totalBadges = await this.database.client.badge.count();
        const totalAwarded = await this.database.client.userBadge.count();
        const activeBadges = await this.database.client.badge.count({
          where: { isActive: true },
        });

        // Get category distribution
        const categoryStats = await this.database.client.badge.groupBy({
          by: ['category'],
          _count: {
            id: true,
          },
        });

        // Get rarity distribution
        const rarityStats = await this.database.client.badge.groupBy({
          by: ['rarity'],
          _count: {
            id: true,
          },
        });

        res.json({
          success: true,
          data: {
            totalBadges,
            totalAwarded,
            activeBadges,
            categoryDistribution: categoryStats.reduce((acc, stat) => {
              acc[stat.category] = stat._count.id;
              return acc;
            }, {} as Record<string, number>),
            rarityDistribution: rarityStats.reduce((acc, stat) => {
              acc[stat.rarity] = stat._count.id;
              return acc;
            }, {} as Record<string, number>),
          },
        });
      } catch (error) {
        this.logger.error('Get badge stats error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get badge statistics',
        });
      }
    });

    // Get user badge progress
    router.get('/progress/:userId', async (req: AuthenticatedRequest, res: Response) => {
      try {
        const { userId } = req.params;

        // Get user's current badges
        const userBadges = await this.database.client.userBadge.findMany({
          where: { userId },
          select: { badgeId: true },
        });

        const earnedBadgeIds = new Set(userBadges.map(ub => ub.badgeId));

        // Get all available badges
        const allBadges = await this.database.client.badge.findMany({
          where: { isActive: true },
        });

        // Calculate progress for each badge
        const progress = allBadges.map(badge => {
          const isEarned = earnedBadgeIds.has(badge.id);
          const requirements = JSON.parse(badge.requirements as string);
          
          return {
            badgeId: badge.id,
            name: badge.name,
            description: badge.description,
            icon: badge.icon,
            category: badge.category,
            rarity: badge.rarity,
            isEarned,
            requirements,
            // Note: Actual progress calculation would require user stats
            progress: isEarned ? 100 : 0,
          };
        });

        res.json({
          success: true,
          data: progress,
        });
      } catch (error) {
        this.logger.error('Get badge progress error:', error);
        res.status(500).json({
          success: false,
          error: 'Failed to get badge progress',
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
      // Get real data from database
      const [userGuilds, totalUsers, totalBadges, totalClips, totalQuizzes, totalPresences] = await Promise.all([
        this.database.client.userGuild.findMany({
          where: { guildId, isActive: true },
          include: {
            user: {
              select: {
                id: true,
                level: true,
                totalXp: true,
                coins: true,
                lastSeen: true,
                stats: {
                  select: {
                    messagesCount: true,
                  }
                }
              }
            }
          }
        }),
        this.database.client.user.count(),
        this.database.client.userBadge.count(),
        this.database.client.clip.count({ where: { guildId } }),
        this.database.client.quiz.count({ where: { guildId } }),
        this.database.client.presence.count({ where: { guildId } })
      ]);

      // Calculate active users (seen in last 7 days)
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const activeUsers = userGuilds.filter(ug => 
        ug.user.lastSeen && new Date(ug.user.lastSeen) > sevenDaysAgo
      ).length;

      // Calculate totals
      const totalXP = userGuilds.reduce((sum, ug) => sum + (ug.user.totalXp || 0), 0);
      const totalCoins = userGuilds.reduce((sum, ug) => sum + (ug.user.coins || 0), 0);
      const totalMessages = userGuilds.reduce((sum, ug) => sum + (ug.user.stats?.messagesCount || 0), 0);

      return {
        users: {
          total: userGuilds.length,
          active: activeUsers,
        },
        economy: {
          totalXP,
          totalCoins,
          totalMessages,
        },
        engagement: {
          badges: totalBadges,
          clips: totalClips,
          presenceSessions: totalPresences,
          quizzes: totalQuizzes,
        },
      };
    } catch (error) {
      this.logger.error('Failed to get guild stats:', error);
      // Return fallback stats on error
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
            
            // Setup WebSocket
            this.setupWebSocket();
              
              // Start simulated updates in development
              if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
                this.startSimulatedUpdates();
              }
              
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
   * Setup WebSocket server
   */
  private setupWebSocket(): void {
    if (!this.server) {
      this.logger.error('HTTP server not initialized');
      return;
    }

    this.io = new SocketIOServer(this.server, {
      cors: {
        origin: this.config.corsOrigins,
        methods: ['GET', 'POST']
      }
    });

    this.io.on('connection', (socket) => {
      this.logger.info(`🔌 WebSocket client connected: ${socket.id}`);

      // Handle dashboard subscription
      socket.on('subscribe:dashboard', (guildId: string) => {
        socket.join(`dashboard:${guildId}`);
        this.logger.info(`📊 Client ${socket.id} subscribed to dashboard:${guildId}`);
        
        // Send initial data
        this.sendDashboardUpdate(guildId);
      });

      // Handle disconnection
      socket.on('disconnect', () => {
        this.logger.info(`🔌 WebSocket client disconnected: ${socket.id}`);
      });
    });

    this.logger.info('🔌 WebSocket server initialized on port ' + this.config.port);
  }

  /**
   * Send dashboard update to subscribed clients
   */
  private async sendDashboardUpdate(guildId: string): Promise<void> {
    try {
      const stats = await this.getGuildStats(guildId);
      this.io?.to(`dashboard:${guildId}`).emit('dashboard:update', {
        type: 'stats',
        data: stats
      });
    } catch (error) {
      this.logger.error('Error sending dashboard update:', error);
    }
  }

  /**
   * Broadcast real-time updates
   */
  public broadcastUpdate(guildId: string, type: string, data: any): void {
    if (this.io) {
      this.io.to(`dashboard:${guildId}`).emit('dashboard:update', {
        type,
        data,
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Broadcast notification to dashboard
   */
  public broadcastNotification(guildId: string, notification: {
    type: 'success' | 'warning' | 'info' | 'error';
    title: string;
    message: string;
    category?: string;
    autoClose?: boolean;
  }): void {
    if (this.io) {
      this.io.to(`dashboard:${guildId}`).emit('dashboard:update', {
        type: 'notification',
        data: notification,
        timestamp: new Date().toISOString()
      });
      this.logger.info(`📢 Notification sent to dashboard:${guildId} - ${notification.title}`);
    }
  }

  /**
   * Stop the API server
   */
  public async stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.io) {
        this.io.close();
        this.io = null;
        this.logger.info('🔌 WebSocket server stopped');
      }
      
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
   * Start real-time updates for development
   */
  private startSimulatedUpdates(): void {
    this.logger.info('🔄 Starting real-time updates for development');
    
    // Stats updates every 30 seconds (reduced frequency for database queries)
    setInterval(async () => {
      if (this.io) {
        try {
          // Get real stats from database for the main guild
          const guildId = '1409723307489755270'; // Main guild ID
          const realStats = await this.getGuildStats(guildId);

          this.logger.info('📊 Broadcasting real stats update');
          this.broadcastUpdate(guildId, 'stats', realStats);
        } catch (error) {
          this.logger.error('Error getting real stats for broadcast:', error);
          // Fallback to basic stats if database query fails
          const fallbackStats = {
            users: { total: 0, active: 0, new: 0 },
            economy: { totalXP: 0, totalCoins: 0, transactions: 0 },
            commands: { total: 0, today: 0 },
            music: { songsPlayed: 0, queueLength: 0 }
          };
          this.broadcastUpdate('1409723307489755270', 'stats', fallbackStats);
        }
      } else {
        this.logger.warn('⚠️ WebSocket not initialized, skipping update');
      }
    }, 30000); // Update every 30 seconds

    // Real notifications will be sent by actual bot events
    // No simulated notifications in production
    this.logger.info('✅ Real-time updates configured - notifications will be sent by actual bot events');
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
