import { Logger } from '../utils/logger';
import { DatabaseService } from '../database/database.service';
import { Request } from 'express';
import * as crypto from 'crypto';
import * as svgCaptcha from 'svg-captcha';
import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';

export interface CaptchaChallenge {
  id: string;
  text: string;
  svg: string;
  expiresAt: Date;
}

export interface SecurityCheck {
  isBot: boolean;
  riskScore: number;
  reasons: string[];
  fingerprint: string;
}

export interface TwoFactorSetup {
  secret: string;
  qrCode: string;
  backupCodes: string[];
}

export class SecurityService {
  private logger: Logger;
  private database: DatabaseService;
  private captchaStore: Map<string, CaptchaChallenge> = new Map();
  private suspiciousIPs: Map<string, { attempts: number; lastAttempt: Date }> = new Map();
  private rateLimitStore: Map<string, { count: number; resetTime: Date }> = new Map();

  constructor(database: DatabaseService) {
    this.logger = new Logger();
    this.database = database;

    // Limpar captchas expirados a cada 5 minutos
    setInterval(() => this.cleanExpiredCaptchas(), 5 * 60 * 1000);

    // Limpar IPs suspeitos a cada hora
    setInterval(() => this.cleanSuspiciousIPs(), 60 * 60 * 1000);
  }

  /**
   * Gerar CAPTCHA para verificação anti-bot
   */
  public generateCaptcha(): CaptchaChallenge {
    const captcha = svgCaptcha.create({
      size: 6,
      ignoreChars: '0o1iIlL',
      noise: 3,
      color: true,
      background: '#f0f0f0',
      width: 200,
      height: 80,
    });

    const challenge: CaptchaChallenge = {
      id: crypto.randomUUID(),
      text: captcha.text.toLowerCase(),
      svg: captcha.data,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutos
    };

    this.captchaStore.set(challenge.id, challenge);
    this.logger.info(`CAPTCHA gerado: ${challenge.id}`);

    return challenge;
  }

  /**
   * Verificar resposta do CAPTCHA
   */
  public verifyCaptcha(captchaId: string, userInput: string): boolean {
    const challenge = this.captchaStore.get(captchaId);

    if (!challenge) {
      this.logger.warn(`CAPTCHA não encontrado: ${captchaId}`);
      return false;
    }

    if (new Date() > challenge.expiresAt) {
      this.captchaStore.delete(captchaId);
      this.logger.warn(`CAPTCHA expirado: ${captchaId}`);
      return false;
    }

    const isValid = userInput.toLowerCase().trim() === challenge.text;

    // Remove o captcha após verificação (uso único)
    this.captchaStore.delete(captchaId);

    if (isValid) {
      this.logger.info(`CAPTCHA verificado com sucesso: ${captchaId}`);
    } else {
      this.logger.warn(`CAPTCHA inválido: ${captchaId}`);
    }

    return isValid;
  }

  /**
   * Análise de segurança da requisição
   */
  public analyzeRequest(req: Request): SecurityCheck {
    const fingerprint = this.generateFingerprint(req);
    let riskScore = 0;
    const reasons: string[] = [];

    // Verificar User-Agent
    const userAgent = req.get('User-Agent') || '';
    if (!userAgent || userAgent.length < 10) {
      riskScore += 30;
      reasons.push('User-Agent suspeito ou ausente');
    }

    // Verificar padrões de bot conhecidos
    const botPatterns = [
      /bot/i,
      /crawler/i,
      /spider/i,
      /scraper/i,
      /curl/i,
      /wget/i,
      /python/i,
      /java/i,
    ];

    if (botPatterns.some(pattern => pattern.test(userAgent))) {
      riskScore += 50;
      reasons.push('User-Agent indica bot automatizado');
    }

    // Verificar headers suspeitos
    const suspiciousHeaders = ['x-forwarded-for', 'x-real-ip'];
    const hasProxyHeaders = suspiciousHeaders.some(header => req.get(header));

    if (hasProxyHeaders) {
      riskScore += 20;
      reasons.push('Uso de proxy detectado');
    }

    // Verificar rate limiting por IP
    const clientIP = this.getClientIP(req);
    const rateLimitCheck = this.checkRateLimit(clientIP, 'registration', 5, 60 * 60 * 1000); // 5 tentativas por hora

    if (!rateLimitCheck.allowed) {
      riskScore += 40;
      reasons.push('Muitas tentativas de registro do mesmo IP');
    }

    // Verificar IPs suspeitos
    const suspiciousIP = this.suspiciousIPs.get(clientIP);
    if (suspiciousIP && suspiciousIP.attempts > 3) {
      riskScore += 35;
      reasons.push('IP com histórico de atividade suspeita');
    }

    // Verificar timing da requisição (muito rápido pode indicar bot)
    const timestamp = Date.now();
    const sessionData = req.session as any;
    const lastRequest = sessionData?.lastRequestTime || 0;
    const timeDiff = timestamp - lastRequest;

    if (timeDiff < 2000 && lastRequest > 0) {
      // Menos de 2 segundos
      riskScore += 25;
      reasons.push('Requisições muito rápidas');
    }

    // Atualizar timestamp da sessão
    if (sessionData) {
      sessionData.lastRequestTime = timestamp;
    }

    const isBot = riskScore >= 50;

    if (isBot) {
      this.recordSuspiciousActivity(clientIP);
      this.logger.warn(
        `Atividade suspeita detectada - IP: ${clientIP}, Score: ${riskScore}, Razões: ${reasons.join(', ')}`
      );
    }

    return {
      isBot,
      riskScore,
      reasons,
      fingerprint,
    };
  }

  /**
   * Configurar 2FA para um usuário
   */
  public async setup2FA(userId: string): Promise<TwoFactorSetup> {
    const secret = speakeasy.generateSecret({
      name: `Hawk Esports Bot (${userId})`,
      issuer: 'Hawk Esports',
      length: 32,
    });

    // Gerar códigos de backup
    const backupCodes = Array.from({ length: 8 }, () =>
      crypto.randomBytes(4).toString('hex').toUpperCase()
    );

    // Gerar QR Code
    const qrCode = await qrcode.toDataURL(secret.otpauth_url!);

    // Salvar no banco de dados (temporário até confirmação)
    await this.database.client.user.update({
      where: { id: userId },
      data: {
        twoFactorSecret: secret.base32,
        twoFactorBackupCodes: backupCodes.join(','),
        twoFactorEnabled: false, // Será ativado após confirmação
      },
    });

    this.logger.info(`2FA configurado para usuário: ${userId}`);

    return {
      secret: secret.base32,
      qrCode,
      backupCodes,
    };
  }

  /**
   * Verificar código 2FA
   */
  public async verify2FA(userId: string, token: string): Promise<boolean> {
    try {
      const user = await this.database.client.user.findUnique({
        where: { id: userId },
        select: {
          twoFactorSecret: true,
          twoFactorBackupCodes: true,
          twoFactorEnabled: true,
        },
      });

      if (!user?.twoFactorSecret) {
        return false;
      }

      // Verificar se é um código de backup
      if (user.twoFactorBackupCodes) {
        const backupCodes = user.twoFactorBackupCodes.split(',');
        const tokenIndex = backupCodes.indexOf(token.toUpperCase());

        if (tokenIndex !== -1) {
          // Remover código de backup usado
          backupCodes.splice(tokenIndex, 1);
          await this.database.client.user.update({
            where: { id: userId },
            data: {
              twoFactorBackupCodes: backupCodes.join(','),
            },
          });

          this.logger.info(`Código de backup 2FA usado: ${userId}`);
          return true;
        }
      }

      // Verificar código TOTP
      const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token: token,
        window: 2, // Permite 2 períodos de tempo (60 segundos)
      });

      if (verified) {
        this.logger.info(`2FA verificado com sucesso: ${userId}`);
      } else {
        this.logger.warn(`2FA inválido: ${userId}`);
      }

      return verified;
    } catch (error) {
      this.logger.error(`Erro ao verificar 2FA para ${userId}:`, error);
      return false;
    }
  }

  /**
   * Ativar 2FA após confirmação
   */
  public async enable2FA(userId: string, token: string): Promise<boolean> {
    const isValid = await this.verify2FA(userId, token);

    if (isValid) {
      await this.database.client.user.update({
        where: { id: userId },
        data: {
          twoFactorEnabled: true,
        },
      });

      this.logger.info(`2FA ativado para usuário: ${userId}`);
      return true;
    }

    return false;
  }

  /**
   * Desativar 2FA
   */
  public async disable2FA(userId: string): Promise<void> {
    await this.database.client.user.update({
      where: { id: userId },
      data: {
        twoFactorEnabled: false,
        twoFactorSecret: null,
        twoFactorBackupCodes: null,
      },
    });

    this.logger.info(`2FA desativado para usuário: ${userId}`);
  }

  /**
   * Verificar rate limiting
   */
  public checkRateLimit(
    identifier: string,
    action: string,
    maxAttempts: number,
    windowMs: number
  ): { allowed: boolean; remaining: number; resetTime: Date } {
    const key = `${identifier}:${action}`;
    const now = new Date();
    const entry = this.rateLimitStore.get(key);

    if (!entry || now > entry.resetTime) {
      // Nova janela de tempo
      const resetTime = new Date(now.getTime() + windowMs);
      this.rateLimitStore.set(key, { count: 1, resetTime });
      return { allowed: true, remaining: maxAttempts - 1, resetTime };
    }

    if (entry.count >= maxAttempts) {
      return { allowed: false, remaining: 0, resetTime: entry.resetTime };
    }

    entry.count++;
    return { allowed: true, remaining: maxAttempts - entry.count, resetTime: entry.resetTime };
  }

  /**
   * Gerar fingerprint da requisição
   */
  private generateFingerprint(req: Request): string {
    const components = [
      req.get('User-Agent') || '',
      req.get('Accept-Language') || '',
      req.get('Accept-Encoding') || '',
      this.getClientIP(req),
      req.get('Accept') || '',
    ];

    return crypto.createHash('sha256').update(components.join('|')).digest('hex').substring(0, 16);
  }

  /**
   * Obter IP real do cliente
   */
  private getClientIP(req: Request): string {
    return (
      req.get('CF-Connecting-IP') ||
      req.get('X-Forwarded-For')?.split(',')[0] ||
      req.get('X-Real-IP') ||
      req.connection.remoteAddress ||
      req.socket.remoteAddress ||
      ''
    ).trim();
  }

  /**
   * Registrar atividade suspeita
   */
  private recordSuspiciousActivity(ip: string): void {
    const existing = this.suspiciousIPs.get(ip) || { attempts: 0, lastAttempt: new Date() };
    existing.attempts++;
    existing.lastAttempt = new Date();
    this.suspiciousIPs.set(ip, existing);
  }

  /**
   * Limpar captchas expirados
   */
  private cleanExpiredCaptchas(): void {
    const now = new Date();
    let cleaned = 0;

    for (const [id, challenge] of this.captchaStore.entries()) {
      if (now > challenge.expiresAt) {
        this.captchaStore.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Limpeza de captchas: ${cleaned} removidos`);
    }
  }

  /**
   * Limpar IPs suspeitos antigos
   */
  private cleanSuspiciousIPs(): void {
    const now = new Date();
    const maxAge = 24 * 60 * 60 * 1000; // 24 horas
    let cleaned = 0;

    for (const [ip, data] of this.suspiciousIPs.entries()) {
      if (now.getTime() - data.lastAttempt.getTime() > maxAge) {
        this.suspiciousIPs.delete(ip);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.debug(`Limpeza de IPs suspeitos: ${cleaned} removidos`);
    }
  }

  /**
   * Obter estatísticas de segurança
   */
  public getSecurityStats(): {
    activeCaptchas: number;
    suspiciousIPs: number;
    rateLimitEntries: number;
  } {
    return {
      activeCaptchas: this.captchaStore.size,
      suspiciousIPs: this.suspiciousIPs.size,
      rateLimitEntries: this.rateLimitStore.size,
    };
  }
}
