import { describe, it, expect } from '@jest/globals';

describe('Basic Tests', () => {
  it('should pass a basic test', () => {
    expect(1 + 1).toBe(2);
  });

  it('should test environment variables', () => {
    expect(process.env.NODE_ENV).toBe('test');
  });

  it('should test string operations', () => {
    const testString = 'Hawk Esports';
    expect(testString).toContain('Hawk');
    expect(testString.toLowerCase()).toBe('hawk esports');
  });

  it('should test array operations', () => {
    const testArray = [1, 2, 3, 4, 5];
    expect(testArray).toHaveLength(5);
    expect(testArray).toContain(3);
  });

  it('should test object operations', () => {
    const testObject = {
      name: 'Test User',
      level: 10,
      active: true
    };
    
    expect(testObject).toHaveProperty('name');
    expect(testObject.level).toBeGreaterThan(5);
    expect(testObject.active).toBe(true);
  });
});