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

  it('surligne dans la barre la part gagnée sur le dernier morceau, et laisse le reste du score en dégradé', () => {
    const element = render({ round: 2, score: 267, objective: 333, maxScore: 500 }, 67);

    const gain = element.querySelector('[data-testid="run-objective-gain"]') as HTMLElement;
    expect(gain.style.left).toBe('40%');
    expect(gain.style.width).toBe('13.4%');
    expect((element.querySelector('[role="progressbar"] > div') as HTMLElement).style.width).toBe('40%');
  });

  it("sans réponse, aucune part n'est surlignée", () => {
    expect(render({ round: 2, score: 200, objective: 333, maxScore: 500 }).querySelector('[data-testid="run-objective-gain"]')).toBeNull();
  });

  it('après une réponse, montre les points gagnés (« +67 »)', () => {
    const element = render({ round: 2, score: 267, objective: 333, maxScore: 500 }, 67);

    expect(text(element, 'run-gain')).toBe('+67');
  });

  it('ne montre aucun multiplicateur', () => {
    const element = render({ round: 2, score: 200, objective: 333, maxScore: 500 });

    expect(element.textContent).not.toMatch(/[×x]\s?\d/);
  });

  it('une manche sans maximum connu (tous ses morceaux retirés) n\'a pas de barre', () => {
    expect(render({ round: 2, score: 0, objective: 0, maxScore: 0 }).querySelector('[role="progressbar"]')).toBeNull();
  });

  describe('après le retrait d\'un morceau', () => {
    it("barre l'ancien objectif à côté du nouveau", () => {
      TestBed.configureTestingModule({ providers: [provideTranslateService()] });
      const fixture = TestBed.createComponent(RunObjectiveComponent);
      fixture.componentRef.setInput('round', { round: 2, score: 200, objective: 266, maxScore: 532 });
      fixture.componentRef.setInput('rounds', 4);
      fixture.componentRef.setInput('previousObjective', 333);
      fixture.detectChanges();
      const element = fixture.nativeElement as HTMLElement;

      expect(text(element, 'run-objective-before')).toBe('333');
      expect(element.querySelector('[data-testid="run-objective-before"]')?.tagName).toBe('S');
      expect(text(element, 'run-objective-points')).toBe('266');
    });

    it("sans retrait, pas d'ancien objectif", () => {
      expect(render({ round: 2, score: 200, objective: 333, maxScore: 500 }).querySelector('[data-testid="run-objective-before"]')).toBeNull();
    });
  });

  describe('au bilan de la manche', () => {
    function ended(round: RunRound) {
      TestBed.configureTestingModule({ providers: [provideTranslateService()] });
      const fixture = TestBed.createComponent(RunObjectiveComponent);
      fixture.componentRef.setInput('round', round);
      fixture.componentRef.setInput('rounds', 4);
      fixture.componentRef.setInput('ended', true);
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    }

    it('objectif atteint : la manche suivante débloquée, le trait au vert', () => {
      const element = ended({ round: 2, score: 466, objective: 333, maxScore: 665 });

      expect(text(element, 'run-objective-label')).toBe('runs.objective.unlocked');
      expect((element.querySelector('[data-testid="run-objective-tick"]') as HTMLElement).style.background).toBe('var(--color-success)');
    });

    it('objectif manqué', () => {
      expect(text(ended({ round: 3, score: 418, objective: 501, maxScore: 835 }), 'run-objective-label')).toBe('runs.objective.missed');
    });

    it("dernière manche gagnée : le disque d'or débloqué", () => {
      expect(text(ended({ round: 4, score: 800, objective: 700, maxScore: 1000 }), 'run-objective-label')).toBe('runs.objective.goldReached');
    });
  });
});
