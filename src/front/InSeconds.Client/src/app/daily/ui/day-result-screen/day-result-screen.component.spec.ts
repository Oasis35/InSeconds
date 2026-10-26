import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { ARCHIVE_DAY } from '../../data-access/testing/fake-daily-api';
import { DayStats } from '../../domain/daily';
import { TrackResultRow } from '../../../gameplay/ui/track-results-list/track-results-list.component';
import { DayResultScreenComponent } from './day-result-screen.component';

const row = (over: Partial<TrackResultRow> = {}): TrackResultRow => ({
  position: 1, artist: 'Eminem', title: 'Lose Yourself', coverUrl: null, artistCorrect: true, titleCorrect: true,
  listenedSeconds: 0.5, averageSecondsWhenCorrect: 1.2, score: 1000, deezerTrackId: 42,
  distribution: [{ durationSeconds: 0.5, count: 1 }], notFoundCount: 0,
  ...over,
});

const stats = (over: Partial<DayStats> = {}): DayStats => ({
  yourScore: 1000, medianScore: 700, totalPlayers: 12, currentStreak: 1, tracks: [],
  freezesUsed: 0, freezeMilestone: false, minScore: 0, maxScore: 1000, maxPossibleScore: 5000,
  scoreDistribution: [{ minScore: 0, maxScore: 2499, count: 8 }, { minScore: 2500, maxScore: 5000, count: 4 }], betterThanPercent: 58,
  ...over,
});

describe('DayResultScreenComponent', () => {
  function render(inputs: Record<string, unknown> = {}) {
    TestBed.configureTestingModule({ providers: [provideTranslateService(), provideRouter([])] });
    const fixture = TestBed.createComponent(DayResultScreenComponent);
    fixture.componentRef.setInput('score', 1000);
    fixture.componentRef.setInput('rows', [row()]);
    fixture.componentRef.setInput('countdown', '01:02:03');
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const byTestId = (id: string) => element.querySelectorAll(`[data-testid="${id}"]`);
    return { fixture, element, byTestId };
  }

  it('affiche le score et le compte à rebours sur la même ligne', () => {
    const { byTestId } = render({ score: 3150 });
    expect(byTestId('day-score')[0].textContent).toContain('3150');
    expect(byTestId('countdown')[0].textContent).toContain('01:02:03');
  });

  it('un tiret à la place du score tant que les stats ne sont pas revenues, et pas de partage', () => {
    const { element, byTestId } = render({ score: null });
    expect(byTestId('day-score')[0].textContent).toContain('-');
    expect(element.querySelector('app-share-button')).toBeNull();
  });

  it('« mieux que X % » sous le score, une seule fois (pas sous l égaliseur)', () => {
    const { byTestId } = render({ stats: stats() });
    expect(byTestId('score-better-than')).toHaveLength(1);
    expect(byTestId('score-better-than')[0].closest('app-score-distribution-chart')).toBeNull();
    expect(byTestId('score-distribution-chart')).toHaveLength(1);
  });

  it('sans stats, ni égaliseur ni « mieux que »', () => {
    const { byTestId } = render();
    expect(byTestId('score-better-than')).toHaveLength(0);
    expect(byTestId('score-distribution-chart')).toHaveLength(0);
  });

  it('le moment fort quand un morceau trouvé a été peu trouvé aussi vite, sinon rien', () => {
    const fast = row({ artist: 'Daft Punk', distribution: [{ durationSeconds: 0.5, count: 1 }, { durationSeconds: 3, count: 9 }], notFoundCount: 10 });
    expect(render({ rows: [fast] }).byTestId('day-highlight')[0].textContent).toContain('Daft Punk');
    TestBed.resetTestingModule();
    expect(render().byTestId('day-highlight')).toHaveLength(0); // un seul joueur : sous le seuil
  });

  it('une barre par morceau : verte, rouge ou moitié-moitié', () => {
    const { byTestId } = render({ rows: [
      row({ position: 1 }),
      row({ position: 2, titleCorrect: false }),
      row({ position: 3, artistCorrect: false, titleCorrect: false }),
    ] });
    const bars = Array.from(byTestId('track-bar')) as HTMLElement[];
    expect(bars).toHaveLength(3);
    expect(bars[0].style.background).toContain('--color-success');
    expect(bars[1].style.background).toContain('linear-gradient');
    expect(bars[2].style.background).toContain('--color-fail');
  });

  it('les barres déplient la liste des morceaux', () => {
    const { fixture, element, byTestId } = render();
    const toggle = byTestId('tracks-toggle')[0] as HTMLButtonElement;
    expect(element.querySelector('app-track-results-list')).toBeNull();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    toggle.click();
    fixture.detectChanges();
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const list = element.querySelector('app-track-results-list')!;
    expect(list.textContent).toContain('Eminem - Lose Yourself');
    expect(list.textContent).toContain('+1000');
  });

  it('désactive le partage quand canShare est faux, et émet « share » sinon', () => {
    expect(render({ canShare: false }).element.querySelector<HTMLButtonElement>('app-share-button button')!.disabled).toBe(true);
    TestBed.resetTestingModule();
    const { fixture, element } = render();
    const emitted = vi.fn();
    fixture.componentInstance.share.subscribe(emitted);
    element.querySelector<HTMLButtonElement>('app-share-button button')!.click();
    expect(emitted).toHaveBeenCalledOnce();
  });

  it('les réponses d hier en bas, vers la page du jour ; rien sans défi hier', () => {
    const link = render({ yesterday: ARCHIVE_DAY() }).byTestId('yesterday-answers')[0] as HTMLAnchorElement;
    expect(link.getAttribute('href')).toBe('/daily/archive/2026-10-21');
    TestBed.resetTestingModule();
    expect(render().byTestId('yesterday-answers')).toHaveLength(0);
  });

  it('marque l écran juste après la partie', () => {
    expect(render({ fresh: true }).byTestId('day-result')[0].getAttribute('data-fresh')).toBe('true');
  });
});
