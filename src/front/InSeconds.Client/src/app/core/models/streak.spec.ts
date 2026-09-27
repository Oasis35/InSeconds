import { StreakDto } from './game.models';
import { dateKey, emptyStreak, isFreezeStockFull, isStreakProtected, pluralKey, streakPillMode, toUtcDate } from './streak';

function dto(partial: Partial<StreakDto>): StreakDto {
  return { status: 'active', streak: 5, freezes: 1, maxFreezes: 2, freezeEveryDays: 7, missedDays: 0, ...partial } as StreakDto;
}

describe('streak (helpers gel de série)', () => {
  describe('streakPillMode', () => {
    it('lost sans série (null ou 0)', () => {
      expect(streakPillMode(null, true)).toBe('lost');
      expect(streakPillMode(dto({ streak: 0 }), true)).toBe('lost');
      expect(streakPillMode(dto({ streak: 0 }), false)).toBe('lost');
    });

    it('guest pour un invité avec une série', () => {
      expect(streakPillMode(dto({ streak: 3 }), false)).toBe('guest');
    });

    it('protected pour un compte dont la série est couverte par un gel', () => {
      expect(streakPillMode(dto({ status: 'protected' }), true)).toBe('protected');
    });

    it('on pour un compte à série active', () => {
      expect(streakPillMode(dto({ status: 'active' }), true)).toBe('on');
    });
  });

  it('pluralKey : 0 et 1 au singulier, au-delà au pluriel', () => {
    expect(pluralKey(0)).toBe('one');
    expect(pluralKey(1)).toBe('one');
    expect(pluralKey(2)).toBe('other');
  });

  describe('toUtcDate', () => {
    it('parse un DateOnly « yyyy-MM-dd » en minuit UTC', () => {
      expect(toUtcDate('2026-09-21')?.toISOString()).toBe('2026-09-21T00:00:00.000Z');
    });

    it('ramène une Date à minuit UTC', () => {
      expect(toUtcDate(new Date('2026-09-21T15:30:00Z'))?.toISOString()).toBe('2026-09-21T00:00:00.000Z');
    });

    it('null pour une valeur absente ou invalide', () => {
      expect(toUtcDate(null)).toBeNull();
      expect(toUtcDate(undefined)).toBeNull();
      expect(toUtcDate('2026')).toBeNull();
      expect(toUtcDate('pas-une-date')).toBeNull();
    });
  });

  it('dateKey : clé yyyy-MM-dd stable, null si invalide', () => {
    expect(dateKey('2026-09-21')).toBe('2026-09-21');
    expect(dateKey(new Date('2026-09-21T23:59:00Z'))).toBe('2026-09-21');
    expect(dateKey(null)).toBeNull();
  });

  describe('isFreezeStockFull', () => {
    it('vrai quand le stock a atteint le plafond', () => {
      expect(isFreezeStockFull(dto({ freezes: 2, maxFreezes: 2 }))).toBe(true);
    });

    it('faux tant qu\'il reste de la place', () => {
      expect(isFreezeStockFull(dto({ freezes: 1, maxFreezes: 2 }))).toBe(false);
    });
  });

  describe('isStreakProtected', () => {
    it('vrai pour un compte connecté avec un statut protected', () => {
      expect(isStreakProtected(dto({ status: 'protected' }), true)).toBe(true);
    });

    it('faux pour un invité même avec un statut protected', () => {
      expect(isStreakProtected(dto({ status: 'protected' }), false)).toBe(false);
    });

    it('faux sans série (null)', () => {
      expect(isStreakProtected(null, true)).toBe(false);
    });
  });

  it('emptyStreak : état neutre à 0', () => {
    expect(emptyStreak()).toEqual(dto({ streak: 0, freezes: 0, maxFreezes: 0, freezeEveryDays: 0 }));
  });
});
