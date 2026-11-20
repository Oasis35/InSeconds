import { TODAY } from '../../data-access/testing/fake-daily-api';
import { openDailyRoute } from '../testing/open-daily-route';

describe('Le jeu du jour : la racine et /daily', () => {
  const open = openDailyRoute;

  it('la racine reste l\'accueil : la carte du défi, sans quitter la racine', async () => {
    const router = await open('/');

    expect(router.url).toBe('/');
    expect(document.querySelector('[data-testid="home-challenge"]')).not.toBeNull();
  });

  it('le défi seul (/daily) renvoie à l\'accueil tant qu\'aucune manche n\'est en cours', async () => {
    const router = await open('/daily');

    expect(router.url).toBe('/');
  });

  it('une partie en pause est un état de la carte du défi (Reprendre, Abandonner), sur l\'accueil', async () => {
    const router = await open('/', TODAY({ state: 'resumable', completedCount: 2 }));

    expect(router.url).toBe('/');
    expect(document.querySelector('[data-testid="home-paused-progress"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="home-abandon"]')).not.toBeNull();
  });

});
