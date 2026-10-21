import { DayStats } from './daily';
import { GUEST_STREAK_INTRO_GAMES, RecapToastInput, recapToasts } from './toasts';

const STATS = (over: Partial<DayStats> = {}): DayStats => ({
  yourScore: 2000, medianScore: 1500, totalPlayers: 3, currentStreak: 7, tracks: [], freezesUsed: 0, freezeMilestone: false,
  minScore: 0, maxScore: 5000, maxPossibleScore: 5000, scoreDistribution: [], betterThanPercent: null, ...over,
});

const INPUT = (over: Partial<RecapToastInput> = {}): RecapToastInput => ({
  linked: true, onRecap: true, abandoned: false, gelDismissed: false, streakDismissedAt: null, gamesPlayed: 2, stats: STATS(), toastStreak: 7,
  ...over,
});

describe('recapToasts', () => {
  it("compte : un gel gagné par la partie du jour s'annonce, et prime sur « un gel a sauvé ta série »", () => {
    const toasts = recapToasts(INPUT({ stats: STATS({ freezeMilestone: true, freezesUsed: 1 }) }));
    expect(toasts.gelEarned).toBe(true);
    expect(toasts.gelUsed).toBe(false);
  });

  it("compte : des gels consommés s'annoncent quand aucun n'est gagné", () => {
    expect(recapToasts(INPUT({ stats: STATS({ freezesUsed: 2 }) })).gelUsed).toBe(true);
  });

  it("compte : rien hors d'un écran de fin, après une fermeture, ou pour une partie abandonnée", () => {
    const stats = STATS({ freezeMilestone: true });
    expect(recapToasts(INPUT({ stats, onRecap: false })).gelEarned).toBe(false);
    expect(recapToasts(INPUT({ stats, gelDismissed: true })).gelEarned).toBe(false);
    expect(recapToasts(INPUT({ stats, abandoned: true })).gelEarned).toBe(false);
  });

  it("invité : la série non sauvegardée s'affiche pendant ses premières parties, tant qu'il ne l'a pas fermée", () => {
    expect(recapToasts(INPUT({ linked: false })).guestStreak).toBe(true);
    expect(recapToasts(INPUT({ linked: false, gamesPlayed: GUEST_STREAK_INTRO_GAMES })).guestStreak).toBe(true);
    expect(recapToasts(INPUT({ linked: false, streakDismissedAt: 1 })).guestStreak).toBe(false);
    expect(recapToasts(INPUT({ linked: false, toastStreak: 0 })).guestStreak).toBe(false);
    expect(recapToasts(INPUT({ linked: false, onRecap: false })).guestStreak).toBe(false);
  });

  it('invité : rien tant que ses parties terminées ne sont pas connues', () => {
    expect(recapToasts(INPUT({ linked: false, gamesPlayed: null })).guestStreak).toBe(false);
  });

  it("invité : après ses premières parties, la série ne s'affiche plus qu'au palier d'un gel", () => {
    const after = GUEST_STREAK_INTRO_GAMES + 1;
    expect(recapToasts(INPUT({ linked: false, gamesPlayed: after })).guestStreak).toBe(false);
    const milestone = recapToasts(INPUT({ linked: false, gamesPlayed: after, stats: STATS({ freezeMilestone: true }) }));
    expect(milestone.guestStreak).toBe(true);
    expect(milestone.guestFreezeMiss).toBe(true);
  });

  it('invité : au palier, une fermeture vaut pour ce palier seulement, même fermé pendant ses premières parties', () => {
    const milestone = (streakDismissedAt: number | null, toastStreak: number) =>
      recapToasts(INPUT({ linked: false, gamesPlayed: 20, toastStreak, streakDismissedAt, stats: STATS({ freezeMilestone: true }) })).guestStreak;
    expect(milestone(2, 7)).toBe(true);
    expect(milestone(7, 7)).toBe(false);
    expect(milestone(7, 14)).toBe(true);
  });

  it('un compte ne voit jamais la série non sauvegardée', () => {
    expect(recapToasts(INPUT({ linked: true, stats: STATS({ freezeMilestone: true }) })).guestStreak).toBe(false);
  });

  it("invité : le palier d'un gel atteint devient « tu aurais gagné un gel », jamais « +1 gel gagné »", () => {
    const toasts = recapToasts(INPUT({ linked: false, stats: STATS({ freezeMilestone: true }) }));
    expect(toasts.guestFreezeMiss).toBe(true);
    expect(toasts.gelEarned).toBe(false);
  });

  it('sans les statistiques du jour (échec de lecture), aucun toast de gel', () => {
    const toasts = recapToasts(INPUT({ stats: null }));
    expect(toasts.gelEarned).toBe(false);
    expect(toasts.gelUsed).toBe(false);
  });
});
