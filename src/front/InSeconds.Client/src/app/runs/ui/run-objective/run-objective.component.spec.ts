import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { RunRound } from '../../domain/run';
import { RunObjectiveComponent } from './run-objective.component';

describe('RunObjectiveComponent', () => {
  function render(round: RunRound, gain: number | null = null, rounds = 4) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(RunObjectiveComponent);
    fixture.componentRef.setInput('round', round);
    fixture.componentRef.setInput('gain', gain);
    fixture.componentRef.setInput('rounds', rounds);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const text = (element: HTMLElement, id: string) => element.querySelector(`[data-testid="${id}"]`)?.textContent?.trim();

  it("montre le score déjà marqué et l'objectif en points", () => {
    const element = render({ round: 2, score: 200, objective: 333, maxScore: 500 });

    expect(text(element, 'run-score')).toBe('200');
    expect(text(element, 'run-objective-points')).toBe('333');
    expect(element.querySelector('[data-testid="run-gain"]')).toBeNull();
  });

  it("place le trait de l'objectif sur le maximum de la manche, et remplit la barre du score", () => {
    const element = render({ round: 2, score: 200, objective: 250, maxScore: 500 });

    expect((element.querySelector('[data-testid="run-objective-tick"]') as HTMLElement).style.left).toBe('50%');
    expect((element.querySelector('[role="progressbar"] > div') as HTMLElement).style.width).toBe('40%');
  });

  it('débloque la manche suivante', () => {
    const element = render({ round: 2, score: 200, objective: 333, maxScore: 500 });

    expect(element.querySelector('[data-testid="run-objective"] p')?.textContent).toContain('runs.objective.unlock');
  });

  it("sur la dernière manche, vise le disque d'or au lieu d'une manche qui n'existe pas", () => {
    const element = render({ round: 4, score: 200, objective: 700, maxScore: 1000 });

    const label = element.querySelector('[data-testid="run-objective"] p')?.textContent;
    expect(label).toContain('runs.objective.gold');
    expect(label).not.toContain('runs.objective.unlock');
  });

  it('après une réponse, montre les points gagnés (« +67 »)', () => {
    const element = render({ round: 2, score: 267, objective: 333, maxScore: 500 }, 67);

    expect(text(element, 'run-gain')).toBe('+67');
  });

  it('ne montre aucun multiplicateur', () => {
    const element = render({ round: 2, score: 200, objective: 333, maxScore: 500 });

    expect(element.textContent).not.toMatch(/[×x]\s?\d/);
  });
});
