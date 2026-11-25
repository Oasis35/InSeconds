import { DayStats } from './daily';
import { GUEST_TILE_COOLDOWN_DAYS, GuestTileInput, RecapToastInput, guestTile, recapToasts } from './toasts';

const STATS = (over: Partial<DayStats> = {}): DayStats => ({
  yourScore: 2000, medianScore: 1500, totalPlayers: 3, currentStreak: 7, tracks: [], freezesUsed: 0, freezeMilestone: false,
  minScore: 0, maxScore: 5000, maxPossibleScore: 5000, scoreDistribution: [], betterThanPercent: null, ...over,
});

const INPUT = (over: Partial<RecapToastInput> = {}): RecapToastInput => ({ linked: true, onRecap: true, abandoned: false, stats: STATS(), ...over });

describe('recapToasts', () => {
  it("compte : un gel gagné par la partie du jour se dit, et prime sur « un gel a sauvé ta série »", () => {
    const toasts = recapToasts(INPUT({ stats: STATS({ freezeMilestone: true, freezesUsed: 1 }) }));
    expect(toasts.gelEarned).toBe(true);
    expect(toasts.gelUsed).toBe(false);
  });

  it("compte : des gels consommés se disent quand aucun n'est gagné", () => {
    expect(recapToasts(INPUT({ stats: STATS({ freezesUsed: 2 }) })).gelUsed).toBe(true);
  });

  it('compte : rien hors d\'un écran de fin ni pour une partie abandonnée', () => {
    const stats = STATS({ freezeMilestone: true });
    expect(recapToasts(INPUT({ stats, onRecap: false })).gelEarned).toBe(false);
    expect(recapToasts(INPUT({ stats, abandoned: true })).gelEarned).toBe(false);
  });

  it("un invité n'a jamais de ligne de gel", () => {
    const toasts = recapToasts(INPUT({ linked: false, stats: STATS({ freezeMilestone: true, freezesUsed: 1 }) }));
    expect(toasts).toEqual({ gelEarned: false, gelUsed: false });
  });
});

const TILE = (over: Partial<GuestTileInput> = {}): GuestTileInput => ({
  linked: false, onWelcome: false, onRecap: true, lostStreak: null, gamesPlayed: 2, stats: STATS(), toastStreak: 3, dismissal: null, today: '2026-11-25', ...over,
});

describe('guestTile', () => {
  it('un compte ne voit jamais la tuile', () => {
    expect(guestTile(TILE({ linked: true }))).toBeNull();
    expect(guestTile(TILE({ linked: true, onWelcome: true, onRecap: false, lostStreak: 4, gamesPlayed: 5 }))).toBeNull();
  });

  it("accueil : le nouveau venu ne voit que « Commencer », celui qui a déjà joué voit « returning »", () => {
    expect(guestTile(TILE({ onWelcome: true, onRecap: false, gamesPlayed: 0 }))).toBeNull();
    expect(guestTile(TILE({ onWelcome: true, onRecap: false, gamesPlayed: null }))).toBeNull();
    expect(guestTile(TILE({ onWelcome: true, onRecap: false, gamesPlayed: 1 }))).toBe('returning');
  });

  it('une série perdue passe devant, sur l\'accueil', () => {
    expect(guestTile(TILE({ onWelcome: true, onRecap: false, gamesPlayed: 0, lostStreak: 6 }))).toBe('lost');
    expect(guestTile(TILE({ onRecap: true, lostStreak: 6 }))).toBe('afterGame');
  });

  it('fin de partie : « afterGame » avec une série, un palier de gel dit « freezeMiss »', () => {
    expect(guestTile(TILE())).toBe('afterGame');
    expect(guestTile(TILE({ stats: STATS({ freezeMilestone: true }) }))).toBe('freezeMiss');
    expect(guestTile(TILE({ toastStreak: 0 }))).toBeNull();
    expect(guestTile(TILE({ gamesPlayed: null }))).toBeNull();
  });

  it("fermée, la tuile se tait pendant le délai puis revient", () => {
    const closed = (day: string) => ({ day, streak: 3 });
    expect(guestTile(TILE({ dismissal: closed('2026-11-25') }))).toBeNull();
    expect(guestTile(TILE({ onWelcome: true, onRecap: false, dismissal: closed('2026-11-12') }))).toBeNull();
    expect(GUEST_TILE_COOLDOWN_DAYS).toBe(14);
    expect(guestTile(TILE({ dismissal: closed('2026-11-11') }))).toBe('afterGame');
    expect(guestTile(TILE({ onWelcome: true, onRecap: false, dismissal: closed('2026-11-11') }))).toBe('returning');
  });

  it('un événement perce la fermeture : palier de gel d\'une autre série, série perdue', () => {
    const stats = STATS({ freezeMilestone: true });
    expect(guestTile(TILE({ stats, dismissal: { day: '2026-11-24', streak: 3 } }))).toBeNull();
    expect(guestTile(TILE({ stats, toastStreak: 7, dismissal: { day: '2026-11-24', streak: 3 } }))).toBe('freezeMiss');
    expect(guestTile(TILE({ onWelcome: true, onRecap: false, lostStreak: 5, dismissal: { day: '2026-11-25', streak: 5 } }))).toBe('lost');
  });

  it('une date de fermeture illisible ou à venir se tait', () => {
    expect(guestTile(TILE({ dismissal: { day: 'hier', streak: 3 } }))).toBeNull();
    expect(guestTile(TILE({ dismissal: { day: '2027-01-01', streak: 3 } }))).toBeNull();
  });
});
