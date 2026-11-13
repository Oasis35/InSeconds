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
import { FakeDailyApi, provideFakeDailyApi } from '../../data-access/testing/fake-daily-api';
import { DailyPage } from './daily.page';

describe('DailyPage : la racine et /daily', () => {
  async function open(url: string, chrome: { v4: boolean; known: boolean }) {
    const api = new FakeDailyApi();
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(),
        provideRouter([{ matcher: homeOrDailyMatcher, component: DailyPage }, { path: '**', children: [] }]),
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
    harness.detectChanges();
    await harness.fixture.whenStable();
    return TestBed.inject(Router);
  }

  it('sans l\'accueil de la V4, la racine renvoie au défi, query string gardée', async () => {
    const router = await open('/?utm_source=share', { v4: false, known: true });
    expect(router.url).toBe('/daily?utm_source=share');
  });

  it('avec la V4, la racine reste l\'accueil', async () => {
    const router = await open('/', { v4: true, known: true });

    expect(router.url).toBe('/');
  });

  it('tant que le flag n\'est pas lu, la racine ne bouge pas', async () => {
    const router = await open('/', { v4: false, known: false });

    expect(router.url).toBe('/');
  });
});
