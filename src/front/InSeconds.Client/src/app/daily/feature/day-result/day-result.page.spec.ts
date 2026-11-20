import { TODAY } from '../../data-access/testing/fake-daily-api';
import { openDailyRoute } from '../testing/open-daily-route';

describe('Le résultat complet du jour (/daily/resultat)', () => {
  const open = openDailyRoute;

  it('défi joué : le résultat complet s’affiche, avec le retour à l’accueil', async () => {
    const router = await open('/daily/resultat', TODAY({ state: 'already_played' }));

    expect(router.url).toBe('/daily/resultat');
    expect(document.querySelector('[data-testid="day-result-page"] app-day-result-screen')).not.toBeNull();
    expect(document.querySelector('[data-testid="day-result-back"]')?.getAttribute('href')).toBe('/');
  });

  it('défi abandonné : l’écran d’abandon, sur la même page', async () => {
    const router = await open('/daily/resultat', TODAY({ state: 'abandoned' }));

    expect(router.url).toBe('/daily/resultat');
    expect(document.querySelector('[data-testid="day-result-page"] app-abandoned-screen')).not.toBeNull();
  });

  it('défi pas encore joué : retour à l’accueil, il n’y a pas de résultat à montrer', async () => {
    const router = await open('/daily/resultat');

    expect(router.url).toBe('/');
  });
});
