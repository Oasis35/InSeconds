import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { SessionLoader } from '../../../account/data-access/session-loader';
import { providePlayersApiFake, fakePlayersApi } from '../../../account/data-access/testing/fake-players-api';
import { FakeAudioPort, provideFakeAudio } from '../../../gameplay/data-access/testing/fake-audio.port';
import { FakeWaveformPort, provideFakeWaveform } from '../../../gameplay/data-access/testing/fake-waveform.port';
import { homeOrDailyMatcher } from '../../../app.routes';
import { DAILY_ROUTES } from '../daily.routes';
import { DailyShellComponent } from '../daily-shell/daily-shell.component';
import { FakeDailyApi, TODAY, provideFakeDailyApi } from '../../data-access/testing/fake-daily-api';

describe('Le résultat complet du jour (/daily/resultat)', () => {
  async function open(url: string, today = TODAY()) {
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
