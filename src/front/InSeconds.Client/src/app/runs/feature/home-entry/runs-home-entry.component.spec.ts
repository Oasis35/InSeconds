import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { SessionPlayer, SessionStore } from '../../../core/session/session.store';
import { SETLIST_ACCESS_LOADER } from '../../data-access/setlist-access.store';
import { ShellChromeStore } from '../../../core/shell/shell-chrome.store';
import { FakeRunsApi, ME, provideFakeRunsApi } from '../../data-access/testing/fake-runs-api';
import { RunLevel } from '../../domain/run';
import { RunsHomeEntryComponent } from './runs-home-entry.component';

const LEVEL: RunLevel = {
  points: 1380, disc: { key: 'runs.discs.silver', stars: 3 }, nextDisc: { key: 'runs.discs.gold', stars: 4 },
  pointsToNext: 220, progressPercent: 44, provisional: false, runsPlayed: 12, delta: null,
};

describe('RunsHomeEntryComponent', () => {
  const player = (isGuest: boolean): SessionPlayer => ({ id: 'p1', pseudo: 'Clem', email: isGuest ? null : 'c@x.fr', isGuest, isAdmin: false });

  let api: FakeRunsApi;

  beforeEach(() => {
    api = new FakeRunsApi();
  });

  async function render(signedIn: SessionPlayer | null, load: () => Promise<boolean>, dailyDone: boolean | null = false) {
    TestBed.configureTestingModule({
      providers: [provideTranslateService(), provideRouter([]), { provide: SETLIST_ACCESS_LOADER, useValue: load }],
    });
    // Le client de l'API est fourni par le composant lui-même (chargé à la demande) : le test le remplace là.
    TestBed.overrideComponent(RunsHomeEntryComponent, { set: { providers: [provideFakeRunsApi(api)] } });
    TestBed.inject(ShellChromeStore).setDailyDone(dailyDone);
    const session = TestBed.inject(SessionStore);
    if (signedIn) session.signedIn(signedIn);
    session.markLoaded();
    const fixture = TestBed.createComponent(RunsHomeEntryComponent);
    fixture.detectChanges();
    TestBed.tick();
    await new Promise(resolve => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();
    return (fixture.nativeElement as HTMLElement);
  }

  it("un compte qui a l'accès voit la carte", async () => {
    const element = await render(player(false), async () => true);
    expect(element.querySelector('[data-testid="run-home-card"]')).not.toBeNull();
  });

  it('sans accès, rien', async () => {
    const element = await render(player(false), async () => false);
    expect(element.querySelector('[data-testid="run-home-card"]')).toBeNull();
  });

  it("une erreur vaut « pas d'accès »", async () => {
    const element = await render(player(false), () => Promise.reject(new Error('réseau')));
    expect(element.querySelector('[data-testid="run-home-card"]')).toBeNull();
  });

  it("un invité ne demande rien et ne voit rien", async () => {
    const load = vi.fn(async () => true);
    const element = await render(player(true), load);
    expect(load).not.toHaveBeenCalled();
    expect(element.querySelector('[data-testid="run-home-card"]')).toBeNull();
  });

  it("un visiteur sans identité ne demande rien et ne voit rien", async () => {
    const load = vi.fn(async () => true);
    const element = await render(null, load);
    expect(load).not.toHaveBeenCalled();
    expect(element.querySelector('[data-testid="run-home-card"]')).toBeNull();
  });

  it("le défi du jour à jouer : la carte discrète, avec le record", async () => {
    api.meResult = ME({ record: { bestScore: 3420, bestRoundsPassed: 4, isNew: false }, level: LEVEL });
    const element = await render(player(false), async () => true, false);
    const card = element.querySelector('[data-testid="run-home-card"]');
    expect(card?.getAttribute('data-size')).toBe('small');
    expect(card?.textContent).toMatch(/3\s420/);
    expect(card?.textContent).toContain('runs.home.play');
  });

  it("une setlist finie aujourd'hui : « Rejouer » et son score", async () => {
    const today = new Date().toISOString().slice(0, 10);
    api.historyResult = {
      month: today.slice(0, 7), previousMonth: null, nextMonth: null, playedCount: 1, averageScore: 2980, bestScore: 2980,
      runs: [{ sessionId: 9, date: today, disc: { key: 'runs.discs.gold', stars: 4 }, score: 2980, difficulty: 'safe' }],
    };
    const element = await render(player(false), async () => true, false);
    const card = element.querySelector('[data-testid="run-home-card"]');
    expect(card?.textContent).toMatch(/2\s980/);
    expect(card?.textContent).toContain('runs.home.replay');
  });

  it("le défi du jour joué : la carte en grand, avec le niveau", async () => {
    api.meResult = ME({ level: LEVEL });
    const element = await render(player(false), async () => true, true);
    expect(element.querySelector('[data-testid="run-home-card"]')?.getAttribute('data-size')).toBe('big');
    expect(element.querySelector('[data-testid="run-home-level"]')?.textContent).toMatch(/1\s380/);
  });

  it("le record et le niveau qui ne se lisent pas : la carte s'affiche sans eux", async () => {
    api.meResult = new Error('réseau');
    api.historyResult = new Error('réseau');
    const element = await render(player(false), async () => true, true);
    expect(element.querySelector('[data-testid="run-home-card"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="run-home-tagline"]')).not.toBeNull();
  });
});
