import { classifyCode, DEFAULT_CODE_PATTERNS, looksLikeNumber, matchesPatterns } from '../src/domain/codes';

describe('Nummern erkennen', () => {
  it('Aufträge, Gesamtgeräte und Fronten nach Aufbau', () => {
    expect(classifyCode('2512345')).toBe('order');
    expect(classifyCode('2698765')).toBe('order');
    expect(classifyCode(' 2700001 ')).toBe('order');
    expect(classifyCode('07123456')).toBe('device');
    expect(classifyCode('5000001234')).toBe('part');
    expect(classifyCode('5000000123')).toBe('part');
  });

  it('falsche Länge oder anderer Anfang → unbekannt', () => {
    expect(classifyCode('261234')).toBe('unknown');
    expect(classifyCode('26123456')).toBe('unknown');
    expect(classifyCode('2812345')).toBe('unknown');
    expect(classifyCode('0712345')).toBe('unknown');
    expect(classifyCode('500001234')).toBe('unknown');
    expect(classifyCode('5000101234')).toBe('unknown');
    expect(classifyCode('A-2026-0815')).toBe('unknown');
  });

  it('eigene Muster aus den Einstellungen', () => {
    const patterns = { ...DEFAULT_CODE_PATTERNS, order: '28*****,  A-****-****' };
    expect(classifyCode('2812345', patterns)).toBe('order');
    expect(classifyCode('A-2026-0815', patterns)).toBe('order');
    expect(classifyCode('2612345', patterns)).toBe('unknown');
    expect(matchesPatterns('1', ' , ')).toBe(false);
  });

  it('Nummer oder Bezeichnung?', () => {
    expect(looksLikeNumber('07123456')).toBe(true);
    expect(looksLikeNumber('4711-200')).toBe(true);
    expect(looksLikeNumber('Halter links')).toBe(false);
    expect(looksLikeNumber('Deckel')).toBe(false);
    expect(looksLikeNumber('M8')).toBe(true);
  });
});
