import { chartBounds, chartLine, favouriteStep, playersFavouriteStep } from './ear-profile';

describe("profil d'oreille", () => {
  const steps = [
    { seconds: 0.5, percent: 10, playersPercent: 5 },
    { seconds: 1, percent: 30, playersPercent: 20 },
    { seconds: 2, percent: 30, playersPercent: 25 },
  ];

  it('le palier préféré : le plus fréquent, le premier en cas d\'égalité', () => {
    expect(favouriteStep(steps)).toBe(1);
    expect(playersFavouriteStep(steps)).toBe(2);
    expect(favouriteStep([{ seconds: 1, percent: 0, playersPercent: null }])).toBeNull();
    expect(playersFavouriteStep([{ seconds: 1, percent: 10, playersPercent: null }])).toBeNull();
  });

  it('la courbe saute les semaines sans partie et finit sur la dernière valeur', () => {
    const line = chartLine([1000, null, 2000], 1000, 2000, 108, 58);

    expect(line.points).toBe('4,54 104,4');
    expect(line.last).toEqual({ x: 104, y: 4 });
    expect(chartLine([null, null], 0, 1, 100, 50)).toEqual({ points: '', last: null });
  });

  it('les bornes prennent les deux courbes avec une marge', () => {
    expect(chartBounds([{ start: '2026-11-16', average: 2000, playersAverage: 1800, games: 1 }])).toEqual({ min: 1700, max: 2100 });
    expect(chartBounds([{ start: '2026-11-16', average: null, playersAverage: null, games: 0 }])).toBeNull();
  });
});
