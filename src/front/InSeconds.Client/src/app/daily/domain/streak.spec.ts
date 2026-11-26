import { EMPTY_STREAK, Streak, dateKey, isFreezeStockFull, isStreakMilestone, isStreakProtected, pluralKey, streakMilestoneState, streakPillMode, toUtcDate } from './streak';

const streak = (over: Partial<Streak>): Streak => ({ ...EMPTY_STREAK, ...over });

describe('streakPillMode', () => {
  it('lost : aucune série', () => {
    expect(streakPillMode(null, true)).toBe('lost');
    expect(streakPillMode(streak({ streak: 0 }), false)).toBe('lost');
  });

  it('guest : un invité avec une série', () => {
    expect(streakPillMode(streak({ streak: 4 }), false)).toBe('guest');
  });

  it('on et protected : un compte, selon le statut de la série', () => {
    expect(streakPillMode(streak({ streak: 4, status: 'active' }), true)).toBe('on');
    expect(streakPillMode(streak({ streak: 4, status: 'protected' }), true)).toBe('protected');
  });
});

describe('streak helpers', () => {
  it('stock de gels au plafond', () => {
    expect(isFreezeStockFull(streak({ freezes: 2, maxFreezes: 2 }))).toBe(true);
    expect(isFreezeStockFull(streak({ freezes: 1, maxFreezes: 2 }))).toBe(false);
  });

  it('série protégée : seulement pour un compte', () => {
    expect(isStreakProtected(streak({ status: 'protected' }), true)).toBe(true);
    expect(isStreakProtected(streak({ status: 'protected' }), false)).toBe(false);
    expect(isStreakProtected(null, true)).toBe(false);
  });

  it('0 et 1 au singulier, au-delà au pluriel', () => {
    expect([0, 1, 2, 7].map(pluralKey)).toEqual(['one', 'one', 'other', 'other']);
  });

  it('une date de jeu est lue en minuit UTC, quel que soit le fuseau', () => {
    expect(toUtcDate('2026-10-07')?.toISOString()).toBe('2026-10-07T00:00:00.000Z');
    expect(toUtcDate('2026-10-07T23:59:59Z')?.toISOString()).toBe('2026-10-07T00:00:00.000Z');
    expect(toUtcDate(null)).toBeNull();
    expect(toUtcDate('pas une date')).toBeNull();
    expect(dateKey('2026-10-07')).toBe('2026-10-07');
    expect(dateKey(undefined)).toBeNull();
  });
});

describe('jalons de série', () => {
  const base = { ...EMPTY_STREAK, status: 'active' as const };

  it('7, 14, 30, 60, 90, 180, 365 puis chaque année sont des jalons', () => {
    for (const n of [7, 14, 30, 60, 90, 180, 365, 730, 1095]) expect(isStreakMilestone(n)).toBe(true);
    for (const n of [0, 1, 6, 8, 21, 29, 31, 364, 366, 500]) expect(isStreakMilestone(n)).toBe(false);
  });

  it('atteint : la partie du jour a donné le jalon', () => {
    expect(streakMilestoneState({ ...base, streak: 7, lastPlayedDate: '2026-11-26' }, '2026-11-26')).toBe('reached');
  });

  it('le lendemain, la pastille est normale', () => {
    expect(streakMilestoneState({ ...base, streak: 7, lastPlayedDate: '2026-11-26' }, '2026-11-27')).toBeNull();
  });

  it('la veille : la prochaine partie donnerait un jalon', () => {
    expect(streakMilestoneState({ ...base, streak: 6, lastPlayedDate: '2026-11-25' }, '2026-11-26')).toBe('eve');
    expect(streakMilestoneState({ ...base, streak: 29, lastPlayedDate: '2026-11-25' }, '2026-11-26')).toBe('eve');
  });

  it('la veille disparaît une fois la partie du jour jouée, ou sans série active', () => {
    expect(streakMilestoneState({ ...base, streak: 6, lastPlayedDate: '2026-11-26' }, '2026-11-26')).toBeNull();
    expect(streakMilestoneState({ ...base, streak: 6, status: 'protected', lastPlayedDate: '2026-11-24' }, '2026-11-26')).toBeNull();
    expect(streakMilestoneState(null, '2026-11-26')).toBeNull();
    expect(streakMilestoneState({ ...base, streak: 0 }, '2026-11-26')).toBeNull();
  });
});
