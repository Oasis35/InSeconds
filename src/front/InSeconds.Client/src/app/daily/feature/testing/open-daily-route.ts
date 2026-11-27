import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { RouterTestingHarness } from '@angular/router/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { SessionLoader } from '../../../account/data-access/session-loader';
import { providePlayersApiFake, fakePlayersApi } from '../../../account/data-access/testing/fake-players-api';
import { FakeAudioPort, provideFakeAudio } from '../../../gameplay/data-access/testing/fake-audio.port';
import { FakeWaveformPort, provideFakeWaveform } from '../../../gameplay/data-access/testing/fake-waveform.port';
import { DAILY_ROUTES } from '../daily.routes';
import { DailyShellComponent } from '../daily-shell/daily-shell.component';
import { FakeDailyApi, TODAY, provideFakeDailyApi } from '../../data-access/testing/fake-daily-api';

/**
 * Ouvre une adresse du jeu du jour (`/` ou `/daily`) sous la vraie coquille et ses vraies routes, avec le faux client d'API et un
 * état du jour donné, puis laisse l'écran suivre : les specs des pages qui en dépendent partent de là.
 */
export async function openDailyRoute(url: string, today = TODAY()): Promise<Router> {
  const api = new FakeDailyApi();
  api.today = today;
  TestBed.configureTestingModule({
    providers: [
      provideTranslateService(),
      // Les routes du domaine sans leurs fournisseurs (le vrai client d'API prendrait la place du faux).
      provideRouter([{ path: '', component: DailyShellComponent, children: DAILY_ROUTES[0].children }, { path: '**', children: [] }]),
      provideFakeDailyApi(api),
      provideFakeAudio(new FakeAudioPort()),
      provideFakeWaveform(new FakeWaveformPort()),
      providePlayersApiFake(fakePlayersApi()),
      { provide: SessionLoader, useValue: { ensureGuest: () => Promise.resolve() } },
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
