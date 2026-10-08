import { DEFAULT_CODE_PATTERNS } from '../src/domain/codes';
import { requiredReads, ScanConfirm } from '../src/domain/scan';

describe('Scan-Bestätigung', () => {
  const required = (c: string) => requiredReads(c, DEFAULT_CODE_PATTERNS);

  it('bekannte Nummern zweimal, unbekannte dreimal', () => {
    expect(required('2607253')).toBe(2); // Auftrag (Code 39 auf dem Auftragspapier)
    expect(required('07573114')).toBe(2); // Gesamtgerät (Data Matrix)
    expect(required('260725')).toBe(3); // halb gelesen
  });

  it('meldet einen Code erst nach mehreren gleichen Lesungen', () => {
    const c = new ScanConfirm(required);
    expect(c.push(['2607253'])).toEqual([]);
    expect(c.push([])).toEqual([]);
    expect(c.push(['2607253'])).toEqual(['2607253']);
  });

  it('einzelne Fehllesungen gehen unter, zwei Codes im Bild werden beide bestätigt', () => {
    const c = new ScanConfirm(required);
    c.push(['260725', '07573114']);
    c.push(['2607253']);
    expect(c.push(['2607253', '07573114'])).toEqual(['2607253', '07573114']);
    expect(c.push(['2607258'])).toEqual([]); // eine abweichende Lesung reicht nicht
  });

  it('alte Bilder fallen aus dem Fenster; reset leert', () => {
    const c = new ScanConfirm(required, 3);
    c.push(['2607253']);
    c.push([]);
    c.push([]);
    expect(c.push(['2607253'])).toEqual([]);
    c.reset();
    expect(c.push(['2607253'])).toEqual([]);
  });
});
