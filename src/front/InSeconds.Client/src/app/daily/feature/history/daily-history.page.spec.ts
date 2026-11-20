import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { providePlayersApiFake, fakePlayersApi } from '../../../account/data-access/testing/fake-players-api';
import { ShellChromeStore } from '../../../core/shell/shell-chrome.store';
import { settle } from '../../../account/feature/testing/dom';
import { utcDayOf } from '../../../ui/format/day-label';
import { EAR_PROFILE, FakeDailyApi, HISTORY, provideFakeDailyApi } from '../../data-access/testing/fake-daily-api';
import { DailyHistoryPage } from './daily-history.page';

const TODAY = utcDayOf(new Date());

describe('DailyHistoryPage', () => {
  async function render(url = '/history/daily', fake = new FakeDailyApi(), { survie = true, dailyDone = false as boolean | null } = {}) {
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(), provideRouter([{ path: 'history/daily', component: DailyHistoryPage }, { path: '**', children: [] }]),
        providePlayersApiFake(fakePlayersApi()), provideFakeDailyApi(fake),
      ],
    });
    TestBed.inject(ShellChromeStore).setSurvie(survie);
    TestBed.inject(ShellChromeStore).setDailyDone(dailyDone);
    await TestBed.inject(Router).navigateByUrl(url);
    const fixture = TestBed.createComponent(DailyHistoryPage);
    await settle(fixture);
    return { fixture, fake, el: fixture.nativeElement as HTMLElement };
  }

  const withToday = (state: 'today' | 'played', score: number | null = null) =>
    HISTORY({ days: [{ date: TODAY, state, score, maxPossibleScore: 5000 }] });

  it("lit le mois en cours sans mois dans l'adresse, montre le calendrier, le profil et « À réécouter »", async () => {
    const { el, fake } = await render();

    expect(fake.calls).toContain('history ');
    expect(fake.calls).toContain('earProfile 8w');
    expect(el.querySelector('[data-testid="history-calendar"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="ear-profile-card"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="history-replay"]')?.getAttribute('href')).toBe('/history/daily/a-reecouter');
    expect(el.querySelector('[data-testid="history-tab-daily"]')?.getAttribute('aria-current')).toBe('page');
  });

  it('lit le mois de l’adresse', async () => {
    const { fake } = await render('/history/daily?mois=2026-09');

    expect(fake.calls).toContain('history 2026-09');
  });

  it("sans l'accès Survie, pas d'onglets", async () => {
    const { el } = await render('/history/daily', new FakeDailyApi(), { survie: false });

    expect(el.querySelector('[data-testid="history-tab-daily"]')).toBeNull();
    expect(el.querySelector('[data-testid="history-calendar"]')).not.toBeNull();
  });

  it("le défi d'aujourd'hui à jouer est la tuile de focus ; joué, il montre son score", async () => {
    const toPlay = new FakeDailyApi();
    toPlay.history = withToday('today');
    const first = await render('/history/daily', toPlay);
    expect(first.el.querySelector('[data-testid="history-today"]')?.classList).toContain('tube-amber');
    TestBed.resetTestingModule();

    const played = new FakeDailyApi();
    played.history = withToday('played', 2400);
    const second = await render('/history/daily', played, { dailyDone: true });
    const tile = second.el.querySelector('[data-testid="history-today"]');
    expect(tile?.classList).not.toContain('tube-amber');
    expect(tile?.textContent?.replace(/\s/g, '')).toContain('2400');
  });

  it("sans partie sur 8 semaines, pas de carte du profil", async () => {
    const fake = new FakeDailyApi();
    fake.earProfile = EAR_PROFILE({ gamesPlayed: 0 });
    const { el } = await render('/history/daily', fake);

    expect(el.querySelector('[data-testid="ear-profile-card"]')).toBeNull();
  });

  it("un échec de lecture montre l'écran d'erreur", async () => {
    const fake = new FakeDailyApi();
    fake.history = new Error('panne');
    const { el } = await render('/history/daily', fake);

    expect(el.querySelector('[data-testid="history-calendar"]')).toBeNull();
    expect(el.querySelector('app-status-screen')).not.toBeNull();
  });
});
