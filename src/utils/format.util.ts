/**
 * Utility class for common formatting operations
 */
export class FormatUtils {
  /**
   * Number formatting
   */
  static formatNumber(num: number, locale: string = 'pt-BR'): string {
    return new Intl.NumberFormat(locale).format(num);
  }

  static formatCurrency(
    amount: number, 
    currency: string = 'BRL', 
    locale: string = 'pt-BR'
  ): string {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency
    }).format(amount);
  }

  static formatPercentage(
    value: number, 
    decimals: number = 1,
    locale: string = 'pt-BR'
  ): string {
    return new Intl.NumberFormat(locale, {
      style: 'percent',
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals
    }).format(value / 100);
  }

  static formatCompactNumber(
    num: number,
    locale: string = 'pt-BR'
  ): string {
    return new Intl.NumberFormat(locale, {
      notation: 'compact',
      compactDisplay: 'short'
    }).format(num);
  }

  static formatOrdinal(num: number, locale: string = 'pt-BR'): string {
    if (locale === 'pt-BR') {
      return `${num}º`;
    }
    
    const pr = new Intl.PluralRules(locale, { type: 'ordinal' });
    const suffixes = new Map([
      ['one', 'st'],
      ['two', 'nd'],
      ['few', 'rd'],
      ['other', 'th'],
    ]);
    const rule = pr.select(num);
    const suffix = suffixes.get(rule);
    return `${num}${suffix}`;
  }

  /**
   * Date and time formatting
   */
  static formatDate(
    date: Date | string | number,
    format: 'short' | 'medium' | 'long' | 'full' = 'medium',
    locale: string = 'pt-BR'
  ): string {
    const dateObj = new Date(date);
    return new Intl.DateTimeFormat(locale, {
      dateStyle: format
    }).format(dateObj);
  }

  static formatTime(
    date: Date | string | number,
    format: 'short' | 'medium' | 'long' = 'short',
    locale: string = 'pt-BR'
  ): string {
    const dateObj = new Date(date);
    return new Intl.DateTimeFormat(locale, {
      timeStyle: format
    }).format(dateObj);
  }

  static formatDateTime(
    date: Date | string | number,
    dateFormat: 'short' | 'medium' | 'long' | 'full' = 'medium',
    timeFormat: 'short' | 'medium' | 'long' = 'short',
    locale: string = 'pt-BR'
  ): string {
    const dateObj = new Date(date);
    return new Intl.DateTimeFormat(locale, {
      dateStyle: dateFormat,
      timeStyle: timeFormat
    }).format(dateObj);
  }

  static formatRelativeTime(
    date: Date | string | number,
    locale: string = 'pt-BR'
  ): string {
    const dateObj = new Date(date);
    const now = new Date();
    const diffInSeconds = Math.floor((now.getTime() - dateObj.getTime()) / 1000);
    
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
    
    if (Math.abs(diffInSeconds) < 60) {
      return rtf.format(-diffInSeconds, 'second');
    } else if (Math.abs(diffInSeconds) < 3600) {
      return rtf.format(-Math.floor(diffInSeconds / 60), 'minute');
    } else if (Math.abs(diffInSeconds) < 86400) {
      return rtf.format(-Math.floor(diffInSeconds / 3600), 'hour');
    } else if (Math.abs(diffInSeconds) < 2592000) {
      return rtf.format(-Math.floor(diffInSeconds / 86400), 'day');
    } else if (Math.abs(diffInSeconds) < 31536000) {
      return rtf.format(-Math.floor(diffInSeconds / 2592000), 'month');
    } else {
      return rtf.format(-Math.floor(diffInSeconds / 31536000), 'year');
    }
  }

  static formatDuration(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    const parts: string[] = [];
    
    if (days > 0) parts.push(`${days}d`);
    if (hours % 24 > 0) parts.push(`${hours % 24}h`);
    if (minutes % 60 > 0) parts.push(`${minutes % 60}m`);
    if (seconds % 60 > 0) parts.push(`${seconds % 60}s`);
    
    return parts.join(' ') || '0s';
  }

  static formatUptime(milliseconds: number): string {
    const seconds = Math.floor(milliseconds / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else {
      return `${minutes}m ${seconds % 60}s`;
    }
  }

  /**
   * Text formatting
   */
  static capitalize(text: string): string {
    return text.charAt(0).toUpperCase() + text.slice(1).toLowerCase();
  }

  static titleCase(text: string): string {
    return text.replace(/\w\S*/g, (txt) => 
      txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase()
    );
  }

  static camelCase(text: string): string {
    return text
      .replace(/(?:^\w|[A-Z]|\b\w)/g, (word, index) => 
        index === 0 ? word.toLowerCase() : word.toUpperCase()
      )
      .replace(/\s+/g, '');
  }

  static kebabCase(text: string): string {
    return text
      .replace(/([a-z])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .toLowerCase();
  }

  static snakeCase(text: string): string {
    return text
      .replace(/([a-z])([A-Z])/g, '$1_$2')
      .replace(/[\s-]+/g, '_')
      .toLowerCase();
  }

  static truncate(text: string, maxLength: number, suffix: string = '...'): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength - suffix.length) + suffix;
  }

  static padStart(text: string, length: number, padString: string = ' '): string {
    return text.padStart(length, padString);
  }

  static padEnd(text: string, length: number, padString: string = ' '): string {
    return text.padEnd(length, padString);
  }

  static removeAccents(text: string): string {
    return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  }

  static slugify(text: string): string {
    return this.removeAccents(text)
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/[\s-]+/g, '-')
      .replace(/^-+|-+$/g, '');
  }

  /**
   * List formatting
   */
  static formatList(
    items: string[],
    locale: string = 'pt-BR',
    type: 'conjunction' | 'disjunction' = 'conjunction'
  ): string {
    if (items.length === 0) return '';
    if (items.length === 1) return items[0] || '';
    
    const formatter = new Intl.ListFormat(locale, {
      style: 'long',
      type: type
    });
    
    return formatter.format(items);
  }

  static formatBulletList(items: string[], bullet: string = '•'): string {
    return items.map(item => `${bullet} ${item}`).join('\n');
  }

  static formatNumberedList(items: string[], startFrom: number = 1): string {
    return items.map((item, index) => `${startFrom + index}. ${item}`).join('\n');
  }

  /**
   * Progress and status formatting
   */
  static formatProgressBar(
    current: number,
    total: number,
    length: number = 20,
    filledChar: string = '█',
    emptyChar: string = '░'
  ): string {
    const percentage = Math.max(0, Math.min(1, current / total));
    const filledLength = Math.round(length * percentage);
    const emptyLength = length - filledLength;
    
    return filledChar.repeat(filledLength) + emptyChar.repeat(emptyLength);
  }

  static formatPercentageBar(
    percentage: number,
    length: number = 20,
    filledChar: string = '█',
    emptyChar: string = '░'
  ): string {
    return this.formatProgressBar(percentage, 100, length, filledChar, emptyChar);
  }

  static formatStatus(
    status: 'online' | 'offline' | 'idle' | 'dnd' | 'invisible',
    locale: string = 'pt-BR'
  ): string {
    const statusMap = {
      'pt-BR': {
        online: '🟢 Online',
        offline: '⚫ Offline',
        idle: '🟡 Ausente',
        dnd: '🔴 Não Perturbe',
        invisible: '⚫ Invisível'
      },
      'en-US': {
        online: '🟢 Online',
        offline: '⚫ Offline',
        idle: '🟡 Idle',
        dnd: '🔴 Do Not Disturb',
        invisible: '⚫ Invisible'
      }
    };
    
    return statusMap[locale as keyof typeof statusMap]?.[status] || status;
  }

  /**
   * File size formatting
   */
  static formatFileSize(bytes: number, decimals: number = 2): string {
    if (bytes === 0) return '0 Bytes';
    
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];
    
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
  }

  /**
   * Color formatting
   */
  static hexToRgb(hex: string): { r: number; g: number; b: number } | null {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result && result[1] && result[2] && result[3] ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  }

  static rgbToHex(r: number, g: number, b: number): string {
    return '#' + [r, g, b].map(x => {
      const hex = x.toString(16);
      return hex.length === 1 ? '0' + hex : hex;
    }).join('');
  }

  /**
   * Discord-specific formatting
   */
  static formatDiscordTimestamp(
    date: Date | string | number,
    style: 't' | 'T' | 'd' | 'D' | 'f' | 'F' | 'R' = 'f'
  ): string {
    const timestamp = Math.floor(new Date(date).getTime() / 1000);
    return `<t:${timestamp}:${style}>`;
  }

  static formatDiscordMention(
    type: 'user' | 'channel' | 'role',
    id: string
  ): string {
    switch (type) {
      case 'user':
        return `<@${id}>`;
      case 'channel':
        return `<#${id}>`;
      case 'role':
        return `<@&${id}>`;
      default:
        return id;
    }
  }

  static formatCodeBlock(code: string, language?: string): string {
    return `\`\`\`${language || ''}\n${code}\n\`\`\``;
  }

  static formatInlineCode(code: string): string {
    return `\`${code}\``;
  }

  static formatBold(text: string): string {
    return `**${text}**`;
  }

  static formatItalic(text: string): string {
    return `*${text}*`;
  }

  static formatUnderline(text: string): string {
    return `__${text}__`;
  }

  static formatStrikethrough(text: string): string {
    return `~~${text}~~`;
  }

  static formatSpoiler(text: string): string {
    return `||${text}||`;
  }

  static formatQuote(text: string): string {
    return `> ${text}`;
  }

  static formatBlockQuote(text: string): string {
    return `>>> ${text}`;
  }
}