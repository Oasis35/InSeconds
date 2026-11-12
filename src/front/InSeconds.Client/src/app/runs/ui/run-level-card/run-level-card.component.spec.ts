import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { RunLevel } from '../../domain/run';
import { RunLevelCardComponent } from './run-level-card.component';

describe('RunLevelCardComponent', () => {
  const level = (overrides: Partial<RunLevel> = {}): RunLevel => ({
    points: 1380, disc: { key: 'runs.discs.silver', stars: 0 }, nextDisc: { key: 'runs.discs.gold', stars: 0 }, pointsToNext: 220,
    progressPercent: 56, provisional: false, runsPlayed: 12, delta: null, ...overrides,
  });

  function render(value: RunLevel, reviewLink: string | null = null) {
    TestBed.configureTestingModule({ providers: [provideTranslateService(), provideRouter([])] });
    const fixture = TestBed.createComponent(RunLevelCardComponent);
    fixture.componentRef.setInput('level', value);
    fixture.componentRef.setInput('reviewLink', reviewLink);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const find = (element: HTMLElement, id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  const text = (element: HTMLElement, id: string) => find(element, id)?.textContent?.replace(/\s+/g, ' ').trim();

  it('le disque, les points au format de la langue, la jauge et le disque suivant', () => {
    const element = render(level());

    expect(find(element, 'run-level')?.getAttribute('data-disc')).toBe('runs.discs.silver');
    expect(text(element, 'run-level-points')).toBe('1 380');
    expect(find(element, 'run-level-bar')?.style.width).toBe('56%');
    expect(text(element, 'run-level-next')).toBe('runs.level.next');
    expect(find(element, 'run-level-provisional')).toBeNull();
    expect(find(element, 'run-level-delta')).toBeNull();
    expect(find(element, 'run-level-review')).toBeNull();
  });

  it('une hausse en orange (le joueur), une baisse en gris', () => {
    const up = find(render(level({ delta: 38 })), 'run-level-delta');
    expect(up?.textContent?.trim()).toBe('+38');
    expect(up?.style.color).toBe('var(--color-accent-3)');

    TestBed.resetTestingModule();
    const down = find(render(level({ delta: -12 })), 'run-level-delta');
    expect(down?.textContent?.trim()).toBe('−12');
    expect(down?.style.color).toBe('var(--text-muted)');
  });

  it('un niveau provisoire le dit, le dernier disque n\'a pas de suivant', () => {
    const element = render(level({ provisional: true, disc: { key: 'runs.discs.diamond', stars: 0 }, nextDisc: null, pointsToNext: null, progressPercent: 100 }));

    expect(text(element, 'run-level-provisional')).toContain('runs.level.provisional');
    expect(text(element, 'run-level-next')).toBe('runs.level.top');
  });

  it('« Revoir » mène à la partie dans l\'historique', () => {
    expect(find(render(level(), '/setlist/history/7'), 'run-level-review')?.getAttribute('href')).toBe('/setlist/history/7');
  });
});
