import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { ARCHIVE_DAY } from '../../data-access/testing/fake-daily-api';
import { DayStats, TrackStat } from '../../domain/daily';
import { AlreadyPlayedScreenComponent } from './already-played-screen.component';

const track = (over: Partial<TrackStat> = {}): TrackStat => ({
  position: 1, artist: 'Eminem', title: 'Lose Yourself', deezerTrackId: 42, coverUrl: 'http://x/c.jpg',
  averageSecondsWhenCorrect: 0.5, artistCorrect: true, titleCorrect: true,
  listenedSeconds: 0.5, score: 1000, distribution: [{ durationSeconds: 0.5, count: 1 }], notFoundCount: 0,
  ...over,
});

const stats = (over: Partial<DayStats> = {}): DayStats => ({
  yourScore: 700, medianScore: 700, totalPlayers: 1, currentStreak: 1, tracks: [track()],
  freezesUsed: 0, freezeMilestone: false, minScore: 700, maxScore: 700, maxPossibleScore: 5000,
  scoreDistribution: [], betterThanPercent: null,
  ...over,
});

describe('AlreadyPlayedScreenComponent', () => {
  function render(inputs: Record<string, unknown>) {
    TestBed.configureTestingModule({ providers: [provideTranslateService(), provideRouter([])] });
    const fixture = TestBed.createComponent(AlreadyPlayedScreenComponent);
    fixture.componentRef.setInput('countdown', '01:02:03');
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, element, text: () => element.textContent!.replace(/\s+/g, ' ') };
  }

  it("montre l'encart des réponses d'hier sous la carte du score, avec les pochettes et la médiane", () => {
    const { element } = render({ stats: stats(), yesterday: ARCHIVE_DAY() });
    const card = element.querySelector<HTMLAnchorElement>('[data-testid=yesterday-answers]')!;
    expect(card.getAttribute('href')).toBe('/daily/archive/2026-10-21');
    expect(card.querySelectorAll('img')).toHaveLength(3);
    expect(card.textContent).toContain('2250');
  });

  it('sous le seuil de joueurs hier, un simple lien', () => {
    const few = render({ stats: stats(), yesterday: ARCHIVE_DAY({ hasStats: false, medianScore: null }) }).element;
    expect(few.querySelector('[data-testid=yesterday-answers] img')).toBeNull();
    expect(few.querySelector('[data-testid=yesterday-answers]')).not.toBeNull();
  });

  it('sans défi hier, pas d encart', () => {
    expect(render({ stats: stats() }).element.querySelector('[data-testid=yesterday-answers]')).toBeNull();
  });

  it('affiche le compte à rebours', () => {
    expect(render({ stats: stats() }).text()).toContain('01:02:03');
  });

  it('affiche le score du joueur et le bouton de partage', () => {
    const { element, text } = render({ stats: stats() });
    expect(text()).toContain('700');
    expect(element.querySelector('app-share-button')).not.toBeNull();
  });

  it('n offre pas le partage sans score (partie non terminée)', () => {
    const { element, text } = render({ stats: stats({ yourScore: null }) });
    expect(text()).toContain('-');
    expect(element.querySelector('app-share-button')).toBeNull();
  });

  it('une partie abandonnée n affiche que le message et le compte à rebours', () => {
    const { element, text } = render({ abandoned: true, stats: stats() });
    expect(text()).toContain('01:02:03');
    expect(element.querySelector('app-share-button')).toBeNull();
    expect(element.querySelector('app-track-results-list')).toBeNull();
  });

  it('émet « share » depuis le bouton de partage', () => {
    const { fixture, element } = render({ stats: stats() });
    const emitted = vi.fn();
    fixture.componentInstance.share.subscribe(emitted);
    element.querySelector<HTMLButtonElement>('app-share-button button')!.click();
    expect(emitted).toHaveBeenCalledOnce();
  });

  it('déplie la liste des morceaux avec leur score et leur histogramme', () => {
    const { fixture, element } = render({ stats: stats() });
    expect(element.querySelector('app-track-results-list')).toBeNull();
    const toggle = Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find(b => !b.closest('app-share-button'))!;
    toggle.click();
    fixture.detectChanges();
    const list = element.querySelector('app-track-results-list')!;
    expect(list.textContent).toContain('Eminem - Lose Yourself');
    expect(list.querySelector('button[aria-label]')!.textContent).toContain('+1000');
  });

  it('les lignes gardent null les champs du joueur sans partie terminée', () => {
    const { fixture } = render({
      stats: stats({
        yourScore: null,
        tracks: [track({ artistCorrect: null, titleCorrect: null, listenedSeconds: null, score: null, coverUrl: null, distribution: [] })],
      }),
    });
    const row = fixture.componentInstance['playedRows']()[0];
    expect(row.artistCorrect).toBeNull();
    expect(row.score).toBeNull();
    expect(row.coverUrl).toBeNull();
  });

  it('les lignes sont vides sans stats', () => {
    expect(render({}).fixture.componentInstance['playedRows']()).toEqual([]);
  });
});
