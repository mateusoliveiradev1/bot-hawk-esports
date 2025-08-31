import { jest } from '@jest/globals';
import { FormatUtils } from '../../src/utils/format.util';

describe('Format Utils', () => {
  describe('formatNumber', () => {
    it('deve formatar números com separadores de milhares', () => {
      expect(FormatUtils.formatNumber(1000)).toBe('1,000');
      expect(FormatUtils.formatNumber(1234567)).toBe('1,234,567');
      expect(FormatUtils.formatNumber(999)).toBe('999');
      expect(FormatUtils.formatNumber(0)).toBe('0');
    });

    it('deve formatar números decimais', () => {
      expect(FormatUtils.formatNumber(1234.56)).toBe('1,234.56');
      expect(FormatUtils.formatNumber(999.99)).toBe('999.99');
    });

    it('deve lidar com números negativos', () => {
      expect(FormatUtils.formatNumber(-1000)).toBe('-1,000');
      expect(FormatUtils.formatNumber(-1234.56)).toBe('-1,234.56');
    });
  });

  describe('formatPercentage', () => {
    it('deve formatar porcentagens com precisão padrão', () => {
      expect(FormatUtils.formatPercentage(0.5)).toBe('50.0%');
      expect(FormatUtils.formatPercentage(0.1234)).toBe('12.3%');
      expect(FormatUtils.formatPercentage(1)).toBe('100.0%');
      expect(FormatUtils.formatPercentage(0)).toBe('0.0%');
    });

    it('deve formatar porcentagens com precisão customizada', () => {
      expect(FormatUtils.formatPercentage(0.1234, 2)).toBe('12.34%');
      expect(FormatUtils.formatPercentage(0.1234, 0)).toBe('12%');
      expect(FormatUtils.formatPercentage(0.1234, 3)).toBe('12.340%');
    });

    it('deve lidar com valores acima de 100%', () => {
      expect(FormatUtils.formatPercentage(1.5)).toBe('150.0%');
      expect(FormatUtils.formatPercentage(2.0)).toBe('200.0%');
    });
  });

  describe('formatDuration', () => {
    it('deve formatar durações em milissegundos', () => {
      expect(FormatUtils.formatDuration(1000)).toBe('1s');
      expect(FormatUtils.formatDuration(60000)).toBe('1m');
      expect(FormatUtils.formatDuration(3600000)).toBe('1h');
      expect(FormatUtils.formatDuration(90000)).toBe('1m 30s');
    });

    it('deve formatar durações complexas', () => {
      expect(FormatUtils.formatDuration(3661000)).toBe('1h 1m 1s');
      expect(FormatUtils.formatDuration(86400000)).toBe('1d');
      expect(FormatUtils.formatDuration(90061000)).toBe('1d 1h 1m 1s');
    });

    it('deve lidar com zero', () => {
      expect(FormatUtils.formatDuration(0)).toBe('0s');
    });
  });

  describe('formatDate', () => {
    it('deve formatar data no formato padrão', () => {
      const date = new Date('2023-12-25T10:30:00Z');
      const result = FormatUtils.formatDate(date);
      expect(result).toMatch(/25\/12\/2023/);
    });

    it('deve formatar data com formato customizado', () => {
      const date = new Date('2023-12-25T10:30:00Z');
      const result = FormatUtils.formatDate(date, 'yyyy-MM-dd');
      expect(result).toBe('2023-12-25');
    });

    it('deve incluir horário quando solicitado', () => {
      const date = new Date('2023-12-25T10:30:00Z');
      const result = FormatUtils.formatDate(date, 'dd/MM/yyyy HH:mm');
      expect(result).toMatch(/25\/12\/2023 \d{2}:\d{2}/);
    });
  });

  describe('truncate', () => {
    it('deve truncar texto longo', () => {
      const longText = 'Este é um texto muito longo que precisa ser truncado';
      expect(FormatUtils.truncate(longText, 20)).toBe('Este é um texto mui...');
    });

    it('deve manter texto curto inalterado', () => {
      const shortText = 'Texto curto';
      expect(FormatUtils.truncate(shortText, 20)).toBe('Texto curto');
    });

    it('deve usar sufixo customizado', () => {
      const text = 'Texto para truncar';
      expect(FormatUtils.truncate(text, 10, ' [...]')).toBe('Texto para [...]');
    });
  });

  describe('capitalize', () => {
    it('deve capitalizar primeira letra', () => {
      expect(FormatUtils.capitalize('hello world')).toBe('Hello world');
      expect(FormatUtils.capitalize('HELLO WORLD')).toBe('HELLO WORLD');
      expect(FormatUtils.capitalize('hELLO wORLD')).toBe('HELLO wORLD');
    });

    it('deve lidar com string vazia', () => {
      expect(FormatUtils.capitalize('')).toBe('');
    });
  });

  describe('formatFileSize', () => {
    it('deve formatar tamanho em bytes', () => {
      expect(FormatUtils.formatFileSize(500)).toBe('500 B');
      expect(FormatUtils.formatFileSize(1023)).toBe('1023 B');
    });

    it('deve formatar tamanho em KB', () => {
      expect(FormatUtils.formatFileSize(1024)).toBe('1.0 KB');
      expect(FormatUtils.formatFileSize(1536)).toBe('1.5 KB');
      expect(FormatUtils.formatFileSize(1048575)).toBe('1024.0 KB');
    });

    it('deve formatar tamanho em MB', () => {
      expect(FormatUtils.formatFileSize(1048576)).toBe('1.0 MB');
      expect(FormatUtils.formatFileSize(1572864)).toBe('1.5 MB');
    });

    it('deve formatar tamanho em GB', () => {
      expect(FormatUtils.formatFileSize(1073741824)).toBe('1.0 GB');
      expect(FormatUtils.formatFileSize(1610612736)).toBe('1.5 GB');
    });

    it('deve formatar tamanho em TB', () => {
      expect(FormatUtils.formatFileSize(1099511627776)).toBe('1.0 TB');
    });

    it('deve lidar com zero', () => {
      expect(FormatUtils.formatFileSize(0)).toBe('0 B');
    });

    it('deve usar precisão customizada', () => {
      expect(FormatUtils.formatFileSize(1536, 2)).toBe('1.50 KB');
      expect(FormatUtils.formatFileSize(1536, 0)).toBe('2 KB');
    });
  });
});