import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { RunRoundSummary } from '../../domain/run';
import { ROUND, TRACK } from '../../data-access/testing/fake-runs-api';
import { RunRoundSummaryComponent } from './run-round-summary.component';

describe('RunRoundSummaryComponent', () => {
  const summary = (overrides: Partial<RunRoundSummary> = {}): RunRoundSummary => ({
    round: 2, passed: true, score: 466, objective: 333,
    tracks: [TRACK({ position: 6, round: 2 }), TRACK({ position: 7, round: 2, titleCorrect: false, points: 67 })], totalScore: 866, ...overrides,
  });

  function render(value: RunRoundSummary, endsRun = false) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(RunRoundSummaryComponent);
    fixture.componentRef.setInput('summary', value);
    fixture.componentRef.setInput('round', ROUND({ round: value.round, score: value.score, objective: value.objective, maxScore: 665 }));
    fixture.componentRef.setInput('rounds', 4);
    fixture.componentRef.setInput('endsRun', endsRun);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  const text = (element: HTMLElement, id: string) => element.querySelector(`[data-testid="${id}"]`)?.textContent?.trim();

  it('une manche débloquée : ✓, la manche suivante débloquée, les morceaux, le score total et « Manche suivante »', () => {
    const { element } = render(summary());

    expect(element.querySelector('[data-testid="run-round-end-icon"]')?.getAttribute('data-passed')).toBe('true');
    expect(text(element, 'run-objective-label')).toBe('runs.objective.unlocked');
    expect(element.querySelectorAll('[data-testid="run-round-tracks"] img')).toHaveLength(2);
    expect(element.querySelector('[data-testid="run-round-tracks"]')?.textContent).toContain('+67');
    expect(text(element, 'run-round-total')).toBe('866');
    expect(text(element, 'run-next-round')).toBe('runs.roundEnd.next');
  });

  it('une manche ratée : ✕, l\'objectif manqué, et le bouton mène au résultat', () => {
    const { element } = render(summary({ passed: false, score: 200 }), true);

    expect(element.querySelector('[data-testid="run-round-end-icon"]')?.getAttribute('data-passed')).toBe('false');
    expect(text(element, 'run-objective-label')).toBe('runs.objective.missed');
    expect(text(element, 'run-next-round')).toBe('runs.roundEnd.seeResult');
  });

  it('la dernière manche gagnée dit le disque d\'or débloqué', () => {
    const { element } = render(summary({ round: 4, score: 800, objective: 700 }), true);

    expect(text(element, 'run-objective-label')).toBe('runs.objective.goldReached');
  });

  it('un morceau retiré n\'a pas de ligne : une phrase dit combien il y en a', () => {
    const { element } = render(summary({ tracks: [TRACK({ position: 6, round: 2 }), TRACK({ position: 7, round: 2, neutralized: true, artist: null, title: null })] }));

    expect(element.querySelectorAll('[data-testid="run-round-tracks"] img')).toHaveLength(1);
    expect(text(element, 'run-round-withdrawn')).toBe('runs.roundEnd.withdrawnOne');
  });

  it('le bouton passe à la suite', () => {
    const { fixture, element } = render(summary());
    const next = vi.fn();
    fixture.componentInstance.next.subscribe(next);

    (element.querySelector('[data-testid="run-next-round"]') as HTMLButtonElement).click();

    expect(next).toHaveBeenCalled();
  });
});
