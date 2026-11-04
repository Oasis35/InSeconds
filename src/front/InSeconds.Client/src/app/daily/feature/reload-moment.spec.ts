import { reloadMomentFor } from './reload-moment';

describe('reloadMomentFor', () => {
  it('ne recharge jamais en pleine manche, seulement au prochain changement de page', () => {
    expect(reloadMomentFor('playing')).toBe('navigation');
  });

  it('attend le passage en arrière-plan pendant un chargement', () => {
    expect(reloadMomentFor('loading')).toBe('background');
  });

  it('recharge tout de suite quand rien n\'est en cours', () => {
    for (const screen of ['welcome', 'resume_prompt', 'done', 'already_played', 'no_challenge', 'error'] as const) {
      expect(reloadMomentFor(screen)).toBe('now');
    }
  });
});
