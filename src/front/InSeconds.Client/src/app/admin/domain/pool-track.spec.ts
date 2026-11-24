import { LONG_MISSING_DAYS, isLongMissing, missingDays, summarizeRecheck } from './pool-track';

describe('missingDays', () => {
  const now = new Date('2026-11-24T12:00:00Z');

  it('compte les jours entiers depuis que l\'extrait manque', () => {
    expect(missingDays({ preview: 'missing', previewMissingSince: '2026-11-24T08:00:00Z' }, now)).toBe(0);
    expect(missingDays({ preview: 'missing', previewMissingSince: '2026-11-21T12:00:00Z' }, now)).toBe(3);
    expect(missingDays({ preview: 'missing', previewMissingSince: '2026-11-14T00:00:00Z' }, now)).toBe(10);
  });

  it('rend null sans date, ou si l\'extrait n\'est pas manquant', () => {
    expect(missingDays({ preview: 'missing', previewMissingSince: null }, now)).toBeNull();
    expect(missingDays({ preview: 'available', previewMissingSince: '2026-11-01T00:00:00Z' }, now)).toBeNull();
    expect(missingDays({ preview: 'missing', previewMissingSince: 'pas une date' }, now)).toBeNull();
  });

  it('ne rend jamais un nombre négatif (horloge en retard)', () => {
    expect(missingDays({ preview: 'missing', previewMissingSince: '2026-11-25T00:00:00Z' }, now)).toBe(0);
  });

  it(`un manquant est « long » à partir de ${LONG_MISSING_DAYS} jours`, () => {
    expect(isLongMissing({ preview: 'missing', previewMissingSince: '2026-11-22T00:00:00Z' }, now)).toBe(false);
    expect(isLongMissing({ preview: 'missing', previewMissingSince: '2026-11-21T00:00:00Z' }, now)).toBe(true);
  });
});

describe('summarizeRecheck', () => {
  it('sépare ceux qui ont un extrait, ceux qui manquent encore et ceux sans réponse de Deezer', () => {
    expect(summarizeRecheck([
      { id: 1, preview: 'available', previewMissingSince: null, answered: true },
      { id: 2, preview: 'missing', previewMissingSince: '2026-11-20T00:00:00Z', answered: true },
      { id: 3, preview: 'missing', previewMissingSince: '2026-11-20T00:00:00Z', answered: false },
    ])).toEqual({ available: 1, stillMissing: 1, noAnswer: 1 });
  });
});
