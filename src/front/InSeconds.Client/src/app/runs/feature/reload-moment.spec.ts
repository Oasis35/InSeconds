import { RunScreen } from '../data-access/run-game.store';
import { reloadMomentFor } from './reload-moment';

describe('reloadMomentFor', () => {
  it('jamais pendant une manche : seulement au prochain changement de page', () => {
    expect(reloadMomentFor('playing')).toBe('navigation');
  });

  it('au passage en arrière-plan pendant un chargement, un bilan de manche ou à la fin de la partie', () => {
    expect(reloadMomentFor('loading')).toBe('background');
    expect(reloadMomentFor('round_end')).toBe('background');
    expect(reloadMomentFor('finished')).toBe('background');
  });

  it.each<RunScreen>(['welcome', 'resume', 'access_denied', 'no_challenge', 'error'])('tout de suite sur %s : rien n\'est en cours', screen => {
    expect(reloadMomentFor(screen)).toBe('now');
  });
});
