import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { TODAY } from '../../data-access/testing/fake-daily-api';
import { START_INTENT } from '../start-intent';
import { openDailyRoute } from '../testing/open-daily-route';

describe('Le jeu du jour : la racine et /daily', () => {
  const open = openDailyRoute;

  it('la racine reste l\'accueil : la carte du défi, sans quitter la racine', async () => {
    const router = await open('/');

    expect(router.url).toBe('/');
    expect(document.querySelector('[data-testid="home-challenge"]')).not.toBeNull();
  });

  it('le défi seul (/daily) renvoie à l\'accueil : sans clic sur « Commencer », jamais de manche ni de son', async () => {
    const router = await open('/daily');

    expect(router.url).toBe('/');
    expect(document.querySelector('app-daily-page')).toBeNull();
  });

  it('une partie à reprendre (rechargement en pleine manche) montre la carte de pause sur l\'accueil', async () => {
    const router = await open('/daily', TODAY({ state: 'resumable', completedCount: 1 }));

    expect(router.url).toBe('/');
    expect(document.querySelector('[data-testid="home-paused-progress"]')).not.toBeNull();
  });

  it('le clic de l\'accueil ouvre la manche : /daily avec l\'intention de jouer, code chargé à la demande', async () => {
    const router = await open('/');

    await router.navigate(['/daily'], { info: START_INTENT });
    await new Promise(resolve => setTimeout(resolve, 20));

    expect(router.url).toBe('/daily');
    expect(TestBed.inject(Router).url).toBe('/daily');
    expect(document.querySelector('app-daily-page')).not.toBeNull();
  });

  it('une partie en pause est un état de la carte du défi (Reprendre, Abandonner), sur l\'accueil', async () => {
    const router = await open('/', TODAY({ state: 'resumable', completedCount: 2 }));

    expect(router.url).toBe('/');
    expect(document.querySelector('[data-testid="home-paused-progress"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="home-abandon"]')).not.toBeNull();
  });

});
