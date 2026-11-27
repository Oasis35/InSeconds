import { EMPTY_STREAK, Streak } from './streak';
import { HOME_LINE_VARIANTS, ReturnRecap, dayVariant, homeLine, splitPhrase } from './home-line';

const TODAY = '2026-11-26';
const streak = (over: Partial<Streak> = {}): Streak => ({ ...EMPTY_STREAK, status: 'active', streak: 12, lastPlayedDate: '2026-11-25', ...over });
const recap = (over: Partial<ReturnRecap> = {}): ReturnRecap => ({ yesterdayScore: 2000, averageScore: 2000, weekGames: 5, weekFirstStepFound: 0, ...over });
const input = (over: Partial<Parameters<typeof homeLine>[0]> = {}) => ({ recap: recap(), bestScore: 4000, streak: streak(), today: TODAY, ...over });

describe('homeLine', () => {
  it('sans habitué (pas de récap) : rien à dire', () => {
    expect(homeLine(input({ recap: null }))).toBeNull();
  });

  it('veille de jalon : prime sur tout', () => {
    const line = homeLine(input({ streak: streak({ streak: 6 }), recap: recap({ yesterdayScore: 3800 }) }));
    expect(line).toMatchObject({ kind: 'eve', value: 7 });
  });

  it('record à portée : hier à 85 % du record ou plus, sans l\'avoir battu', () => {
    expect(homeLine(input({ recap: recap({ yesterdayScore: 3500 }) }))).toMatchObject({ kind: 'record', value: 4000 });
    expect(homeLine(input({ recap: recap({ yesterdayScore: 3300, averageScore: 3300 }) }))).toBeNull();
    expect(homeLine(input({ recap: recap({ yesterdayScore: 4000, averageScore: 4000 }) }))).toBeNull();
  });

  it('hier au-dessus ou en dessous de la moyenne de plus de 10 %', () => {
    expect(homeLine(input({ recap: recap({ yesterdayScore: 2300 }) }))).toMatchObject({ kind: 'above', value: 2300 });
    expect(homeLine(input({ recap: recap({ yesterdayScore: 1700 }) }))).toMatchObject({ kind: 'below', value: 1700 });
    expect(homeLine(input({ recap: recap({ yesterdayScore: 2100 }) }))).toBeNull();
  });

  it('sinon, ses morceaux trouvés au premier palier cette semaine (singulier et pluriel)', () => {
    expect(homeLine(input({ recap: recap({ weekFirstStepFound: 1 }) }))?.phraseKey).toMatch(/^daily\.homeLine\.week\.[01]\.phrase\.one$/);
    expect(homeLine(input({ recap: recap({ weekFirstStepFound: 4 }) }))).toMatchObject({ kind: 'week', value: 4 });
  });

  it('pas joué hier : on passe à la semaine, sinon rien', () => {
    expect(homeLine(input({ recap: recap({ yesterdayScore: null, weekFirstStepFound: 3 }) }))?.kind).toBe('week');
    expect(homeLine(input({ recap: recap({ yesterdayScore: null }) }))).toBeNull();
  });

  it('la variante change avec le jour, la même pour tous', () => {
    const variants = new Set(['2026-11-26', '2026-11-27'].map(dayVariant));
    expect(variants.size).toBe(HOME_LINE_VARIANTS);
    expect(dayVariant('2026-11-26')).toBe(dayVariant('2026-11-26'));
  });

  it('splitPhrase coupe autour du marqueur du chiffre', () => {
    expect(splitPhrase('Hier, § : bravo')).toEqual({ before: 'Hier, ', after: ' : bravo', hasValue: true });
    expect(splitPhrase('Rien')).toEqual({ before: 'Rien', after: '', hasValue: false });
  });
});
