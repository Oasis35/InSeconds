import { dayLabel, formatScore, isMonthText, monthLabel, utcDayOf } from './day-label';

describe('dayLabel', () => {
  it("reconnaît aujourd'hui et hier, pas les autres jours", () => {
    expect(dayLabel('2026-11-11', '2026-11-11', 'fr')).toEqual({ relative: 'today', text: 'Mercredi 11' });
    expect(dayLabel('2026-11-10', '2026-11-11', 'fr')).toEqual({ relative: 'yesterday', text: 'Mardi 10' });
    expect(dayLabel('2026-11-09', '2026-11-11', 'fr').relative).toBeNull();
  });

  it('passe un changement de mois et parle anglais', () => {
    expect(dayLabel('2026-10-31', '2026-11-01', 'en')).toEqual({ relative: 'yesterday', text: 'Saturday 31' });
  });
});

describe('monthLabel', () => {
  it('écrit le mois en toutes lettres, capitale en tête', () => {
    expect(monthLabel('2026-11', 'fr')).toBe('Novembre 2026');
    expect(monthLabel('2026-01', 'en')).toBe('January 2026');
  });
});

describe('utcDayOf et isMonthText', () => {
  it('donne le jour UTC', () => {
    expect(utcDayOf(new Date('2026-11-11T23:59:00Z'))).toBe('2026-11-11');
  });

  it("n'accepte qu'un mois bien écrit", () => {
    expect(isMonthText('2026-11')).toBe(true);
    expect(isMonthText('2026-13')).toBe(false);
    expect(isMonthText('novembre')).toBe(false);
    expect(isMonthText(null)).toBe(false);
  });
});

describe('formatScore', () => {
  it('écrit le score dans la langue, un point médian sans score', () => {
    expect(formatScore(2140, 'fr').replace(/\s/g, ' ')).toBe('2 140');
    expect(formatScore(2140, 'en')).toBe('2,140');
    expect(formatScore(null, 'fr')).toBe('·');
  });
});
