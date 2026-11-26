import { CohortRow, StatsDay, day1Rate, day7Rate, maxParts, maxPlayers, percentOf, totalParts } from './stats';

const row: CohortRow = { key: 'all', newPlayers: 10, day1Eligible: 8, day1Returned: 2, day7Eligible: 0, day7Returned: 0 };
const day = (completed: number, abandoned: number, expired: number, players = 0): StatsDay =>
  ({ day: '2026-11-01', completed, abandoned, expired, players, firstTimePlayers: 0 });

describe('stats', () => {
  it('rend un pourcentage arrondi, ou null sans éligible', () => {
    expect(percentOf(1, 3)).toBe(33);
    expect(percentOf(0, 0)).toBeNull();
    expect(day1Rate(row)).toBe(25);
    expect(day7Rate(row)).toBeNull();
  });

  it('additionne les parties et trouve le maximum', () => {
    expect(totalParts(day(3, 1, 2))).toBe(6);
    expect(maxParts([day(1, 0, 0), day(3, 1, 2)])).toBe(6);
    expect(maxParts([])).toBe(1);
    expect(maxPlayers([day(0, 0, 0, 7), day(0, 0, 0, 4)])).toBe(7);
  });
});
