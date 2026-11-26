import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { WeekReview } from '../../domain/week-review';
import { WeekReviewCardComponent } from './week-review-card.component';

const REVIEW: WeekReview = {
  weekStart: '2026-11-16',
  days: ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21', '2026-11-22']
    .map((date, i) => ({ date, score: [2000, 3120, null, 2500, 2800, null, null][i] })),
  maxPossibleScore: 4250,
  playedCount: 4,
  averageScore: 2605,
  bestDay: '2026-11-17',
  bestScore: 3120,
  bestTrack: { date: '2026-11-17', artist: 'Eminem', title: 'Lose Yourself', score: 1000 },
};

describe('WeekReviewCardComponent', () => {
  function render(compact: boolean) {
    TestBed.configureTestingModule({ providers: [provideTranslateService(), provideRouter([])] });
    const fixture = TestBed.createComponent(WeekReviewCardComponent);
    fixture.componentRef.setInput('review', REVIEW);
    fixture.componentRef.setInput('compact', compact);
    fixture.detectChanges();
    return { fixture, root: fixture.nativeElement as HTMLElement };
  }

  it('sept barres du lundi au dimanche : quatre jours joués, trois traits', () => {
    const { root } = render(true);
    expect(root.querySelectorAll('[data-testid="week-review-bar"]')).toHaveLength(4);
    expect(root.querySelectorAll('[data-testid="week-review-bar-empty"]')).toHaveLength(3);
  });

  it('compacte : la moyenne, le lien vers l\'historique et la croix qui émet `closed`', () => {
    const { fixture, root } = render(true);
    let closed = 0;
    fixture.componentInstance.closed.subscribe(() => closed++);
    expect(root.querySelector('[data-testid="week-review-average"]')).not.toBeNull();
    expect(root.querySelector<HTMLAnchorElement>('[data-testid="week-review-link"]')?.getAttribute('href')).toBe('/history/daily');
    root.querySelector<HTMLButtonElement>('[data-testid="week-review-close"]')!.click();
    expect(closed).toBe(1);
    expect(root.querySelector('[data-testid="week-review-best-track"]')).toBeNull();
  });

  it('complète : les dates, le meilleur morceau, ni croix ni lien', () => {
    const { root } = render(false);
    expect(root.querySelector('[data-testid="week-review-range"]')).not.toBeNull();
    expect(root.querySelector('[data-testid="week-review-best-track"]')!.textContent).toContain('Lose Yourself');
    expect(root.querySelector('[data-testid="week-review-close"]')).toBeNull();
    expect(root.querySelector('[data-testid="week-review-link"]')).toBeNull();
  });
});
