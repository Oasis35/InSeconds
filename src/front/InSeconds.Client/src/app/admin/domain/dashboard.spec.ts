import {
  activityBarHeightPx, arrivalShares, canGoToNextDay, canGoToPreviousDay, completionRateColor, formatDayLong, formatDayShort,
  maxDailyPlayers, parseDay, shiftDay, sourceLabelKey, todayUtc, totalPlayers,
} from './dashboard';

describe('dashboard (domaine)', () => {
  const available = ['2026-10-05', '2026-10-04', '2026-10-02'];
  const activity = [
    { day: '2026-10-03', playerCount: 0 }, { day: '2026-10-04', playerCount: 4 }, { day: '2026-10-05', playerCount: 10 },
  ];

  it('parseDay accepte un vrai jour aaaa-mm-jj, rien d\'autre', () => {
    expect(parseDay('2026-11-03')).toBe('2026-11-03');
    expect([null, undefined, '', 'hier', '2026-2-03', '2026-02-30', '2026-13-01'].map(parseDay)).toEqual([null, null, null, null, null, null, null]);
  });

  it('todayUtc rend le jour UTC, pas celui du navigateur', () => {
    expect(todayUtc(new Date('2026-10-05T23:59:00Z'))).toBe('2026-10-05');
    expect(todayUtc(new Date('2026-10-06T00:01:00Z'))).toBe('2026-10-06');
  });

  it('totalise et trouve le pic', () => {
    expect(totalPlayers(activity)).toBe(14);
    expect(maxDailyPlayers(activity)).toBe(10);
    expect(maxDailyPlayers([])).toBe(0);
  });

  it('hauteur des barres : plate à zéro, minimum de 4 px, 64 px au pic', () => {
    expect(activityBarHeightPx(0, 10)).toBe(2);
    expect(activityBarHeightPx(5, 0)).toBe(2);
    expect(activityBarHeightPx(1, 1000)).toBe(4);
    expect(activityBarHeightPx(10, 10)).toBe(64);
    expect(activityBarHeightPx(5, 10)).toBe(32);
  });

  it('couleur du taux de complétion', () => {
    expect(completionRateColor(70)).toBe('var(--color-success)');
    expect(completionRateColor(40)).toBe('var(--color-warn)');
    expect(completionRateColor(39.9)).toBe('var(--color-fail)');
  });

  describe('navigation de jour', () => {
    it('va vers le passé (delta < 0) et le futur (delta > 0)', () => {
      expect(shiftDay(available, '2026-10-04', -1)).toBe('2026-10-02');
      expect(shiftDay(available, '2026-10-04', 1)).toBe('2026-10-05');
    });

    it('rend null au bout de la liste ou sans jour disponible', () => {
      expect(shiftDay(available, '2026-10-05', 1)).toBeNull();
      expect(shiftDay(available, '2026-10-02', -1)).toBeNull();
      expect(shiftDay([], null, -1)).toBeNull();
    });

    it('un jour absent de la liste repart du plus récent', () => {
      expect(shiftDay(available, '2026-10-06', -1)).toBe('2026-10-05');
      expect(shiftDay(available, null, -1)).toBe('2026-10-05');
    });

    it('bornes des boutons', () => {
      expect(canGoToPreviousDay(available, '2026-10-05')).toBe(true);
      expect(canGoToPreviousDay(available, '2026-10-02')).toBe(false);
      expect(canGoToNextDay(available, '2026-10-05')).toBe(false);
      expect(canGoToNextDay(available, '2026-10-04')).toBe(true);
      expect(canGoToPreviousDay([], null)).toBe(false);
      expect(canGoToNextDay([], null)).toBe(false);
    });
  });

  it('met en forme un jour en UTC, en français et en anglais', () => {
    expect(formatDayLong('2026-10-05', 'fr')).toBe('lundi 5 octobre');
    expect(formatDayShort('2026-10-05', 'fr')).toContain('5');
    expect(formatDayLong('2026-10-05', 'en')).toContain('October');
    expect(formatDayLong('2026-01-01', 'fr')).toBe('jeudi 1 janvier');
  });
});

describe('sources d\'arrivée', () => {
  it('une source connue a sa traduction, un domaine s\'affiche tel quel', () => {
    expect(sourceLabelKey('instagram')).toBe('admin.sources.instagram');
    expect(sourceLabelKey('share')).toBe('admin.sources.share');
    expect(sourceLabelKey('google.com')).toBeNull();
  });

  it('les trois sources les plus fréquentes, puis le reste réuni avec `other`, en pourcentages', () => {
    expect(arrivalShares([
      { source: 'instagram', count: 6 }, { source: 'other', count: 2 }, { source: 'share', count: 1 },
      { source: 'direct', count: 1 }, { source: 'google.com', count: 1 },
    ])).toEqual([
      { source: 'instagram', count: 6, percent: 55 },
      { source: 'share', count: 1, percent: 9 },
      { source: 'direct', count: 1, percent: 9 },
      { source: null, count: 3, percent: 27 },
    ]);
  });

  it('pas de reste quand tout tient dans les trois premières ; rien sans arrivée', () => {
    expect(arrivalShares([{ source: 'direct', count: 2 }])).toEqual([{ source: 'direct', count: 2, percent: 100 }]);
    expect(arrivalShares([])).toEqual([]);
  });
});
