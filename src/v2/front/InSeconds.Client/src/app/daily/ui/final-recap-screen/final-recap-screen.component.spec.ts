import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { AnsweredTrack, DayStats } from '../../domain/daily';
import { FinalRecapScreenComponent } from './final-recap-screen.component';

const answered = (over: Partial<AnsweredTrack> = {}): AnsweredTrack => ({
  position: 1, artistCorrect: true, titleCorrect: true, score: 1000, listenedSeconds: 0.5, hintLevel: 0,
  correctArtist: 'Eminem', correctTitle: 'Lose Yourself', deezerTrackId: 42, coverUrl: null,
  averageSecondsWhenCorrect: 0.5, failureRatePercent: 0, distribution: [], notFoundCount: 0,
  ...over,
});

const stats = (): DayStats => ({
  yourScore: 1000, medianScore: 1000, totalPlayers: 1, currentStreak: 1, freezesUsed: 0, freezeMilestone: false,
  minScore: 1000, maxScore: 1000, maxPossibleScore: 5000, scoreDistribution: [], betterThanPercent: null,
  tracks: [{
    position: 1, artist: 'Eminem', title: 'Lose Yourself', deezerTrackId: 42, coverUrl: 'http://x/c.jpg',
    failureRatePercent: 12, averageSecondsWhenCorrect: 0.9, artistCorrect: true, titleCorrect: true,
    listenedSeconds: 0.5, score: 1000, distribution: [{ durationSeconds: 0.5, count: 2 }], notFoundCount: 1,
  }],
});

describe('FinalRecapScreenComponent', () => {
  function render(inputs: Record<string, unknown> = {}) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(FinalRecapScreenComponent);
    fixture.componentRef.setInput('results', [answered()]);
    fixture.componentRef.setInput('displayedScore', 1000);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, element, text: () => element.textContent!.replace(/\s+/g, ' ') };
  }

  it('affiche le score affiché', () => {
    expect(render({ displayedScore: 3150 }).text()).toContain('3150');
  });

  it('affiche le compte à rebours seulement s il est fourni', () => {
    expect(render().text()).not.toContain('01:02:03');
    TestBed.resetTestingModule();
    expect(render({ countdown: '01:02:03' }).text()).toContain('01:02:03');
  });

  it('désactive le partage quand canShare est faux', () => {
    const { element } = render({ canShare: false });
    expect(element.querySelector<HTMLButtonElement>('app-share-button button')!.disabled).toBe(true);
  });

  it('émet « share » depuis le bouton de partage', () => {
    const { fixture, element } = render();
    const emitted = vi.fn();
    fixture.componentInstance.share.subscribe(emitted);
    element.querySelector<HTMLButtonElement>('app-share-button button')!.click();
    expect(emitted).toHaveBeenCalledOnce();
  });

  it('déplie la liste des morceaux', () => {
    const { fixture, element } = render();
    expect(element.querySelector('app-track-results-list')).toBeNull();
    const toggle = Array.from(element.querySelectorAll<HTMLButtonElement>('button')).find(b => !b.closest('app-share-button'))!;
    toggle.click();
    fixture.detectChanges();
    expect(element.querySelector('app-track-results-list')!.textContent).toContain('Eminem — Lose Yourself');
  });

  it('recapRows() se passe des stats quand la réponse porte son histogramme', () => {
    const { fixture } = render({
      results: [answered({ distribution: [{ durationSeconds: 1, count: 5 }], notFoundCount: 2, failureRatePercent: 7 })],
      stats: stats(),
    });
    const row = fixture.componentInstance['recapRows']()[0];
    expect(row.distribution).toEqual([{ durationSeconds: 1, count: 5 }]);
    expect(row.notFoundCount).toBe(2);
    expect(row.failureRatePercent).toBe(7);
  });

  it('recapRows() complète une réponse relue à la reprise avec les stats, par position', () => {
    const { fixture } = render({ stats: stats() });
    const row = fixture.componentInstance['recapRows']()[0];
    expect(row.distribution).toEqual([{ durationSeconds: 0.5, count: 2 }]);
    expect(row.notFoundCount).toBe(1);
    expect(row.failureRatePercent).toBe(12);
    expect(row.averageSecondsWhenCorrect).toBe(0.9);
    expect(row.coverUrl).toBe('http://x/c.jpg');
  });

  it('recapRows() fonctionne sans stats (histogramme vide)', () => {
    const { fixture } = render();
    const rows = fixture.componentInstance['recapRows']();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(expect.objectContaining({ artist: 'Eminem', title: 'Lose Yourself', score: 1000, notFoundCount: 0 }));
    expect(rows[0].distribution).toEqual([]);
  });
});
