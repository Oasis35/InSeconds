import { ApplicationRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { SessionLoader } from '../../../account/data-access/session-loader';
import { providePlayersApiFake, fakePlayersApi } from '../../../account/data-access/testing/fake-players-api';
import { ShellChromeStore } from '../../../core/shell/shell-chrome.store';
import { FakeAudioPort, provideFakeAudio } from '../../../gameplay/data-access/testing/fake-audio.port';
import { FakeWaveformPort, provideFakeWaveform } from '../../../gameplay/data-access/testing/fake-waveform.port';
import { homeOrDailyMatcher } from '../../../app.routes';
import { DAILY_ROUTES } from '../daily.routes';
import { DailyShellComponent } from '../daily-shell/daily-shell.component';
import { FakeDailyApi, TODAY, provideFakeDailyApi } from '../../data-access/testing/fake-daily-api';

describe('Le jeu du jour : la racine et /daily', () => {
  async function open(url: string, chrome: { v4: boolean; known: boolean }, today = TODAY()) {
    const api = new FakeDailyApi();
    api.today = today;
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(),
        // Les routes du domaine sans leurs fournisseurs (le vrai client d'API prendrait la place du faux).
        provideRouter([{ matcher: homeOrDailyMatcher, component: DailyShellComponent, children: DAILY_ROUTES[0].children }, { path: '**', children: [] }]),
        provideFakeDailyApi(api),
        provideFakeAudio(new FakeAudioPort()),
        provideFakeWaveform(new FakeWaveformPort()),
        providePlayersApiFake(fakePlayersApi()),
        { provide: SessionLoader, useValue: { ensureGuest: async () => undefined } },
        { provide: SwUpdate, useValue: { isEnabled: false } },
      ],
    });
    TestBed.inject(ShellChromeStore).setV4(chrome.v4, chrome.known);
    const harness = await RouterTestingHarness.create();
    await harness.navigateByUrl(url);
    await harness.fixture.whenStable();
    // La lecture du jour (faux API) se résout après quelques tours de promesses : on laisse l'écran suivre.
    await new Promise(resolve => setTimeout(resolve, 20));
    harness.detectChanges();
    await harness.fixture.whenStable();
    harness.detectChanges();
    return TestBed.inject(Router);
  }

  it('sans l\'accueil de la V4, la racine renvoie au défi, query string gardée', async () => {
    const router = await open('/?utm_source=share', { v4: false, known: true });
    expect(router.url).toBe('/daily?utm_source=share');
  });

  it('avec la V4, la racine reste l\'accueil : la carte du défi, sans quitter la racine', async () => {
    const router = await open('/', { v4: true, known: true });

    expect(router.url).toBe('/');
    expect(document.querySelector('[data-testid="home-challenge"]')).not.toBeNull();
  });

  it('avec la V4, le défi seul (/daily) renvoie à l\'accueil tant qu\'aucune manche n\'est en cours', async () => {
    const router = await open('/daily', { v4: true, known: true });

    expect(router.url).toBe('/');
  });

  it('avec la V4, une partie en pause est un état de la carte du défi (Reprendre, Abandonner), sur l\'accueil', async () => {
    const router = await open('/', { v4: true, known: true }, TODAY({ state: 'resumable', completedCount: 2 }));

    expect(router.url).toBe('/');
    expect(document.querySelector('[data-testid="home-paused-progress"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="home-abandon"]')).not.toBeNull();
  });

  it('sans la V4, /daily reste le défi', async () => {
    const router = await open('/daily', { v4: false, known: true });

    expect(router.url).toBe('/daily');
  });

  it('tant que le flag n\'est pas lu, un chargement neutre : ni accueil, ni pied de page, ni accès du compte', async () => {
    await open('/', { v4: false, known: false });
    const el = TestBed.inject(ApplicationRef).components[0]?.location.nativeElement as HTMLElement | undefined;
    const root = el ?? document.body;

    expect(root.querySelector('[data-testid="home-v4"]')).toBeNull();
    expect(root.querySelector('app-daily-footer')).toBeNull();
    expect(root.querySelector('app-account-link')).toBeNull();
    expect(root.textContent).toContain('daily.common.loading');
  });

  it('tant que le flag n\'est pas lu, la racine ne bouge pas', async () => {
    const router = await open('/', { v4: false, known: false });

    expect(router.url).toBe('/');
  });
});
