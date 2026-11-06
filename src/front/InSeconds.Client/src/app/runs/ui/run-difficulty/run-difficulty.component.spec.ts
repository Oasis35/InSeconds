import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import fr from '../../../../../public/i18n/fr.json';
import { RunDifficulty, RunDifficultyOption } from '../../domain/run';
import { RunDifficultyComponent, difficultyColumns } from './run-difficulty.component';

const OPTIONS: RunDifficultyOption[] = [
  { difficulty: 'risky', objective: 552, maxScore: 885, listenSeconds: 10 },
  { difficulty: 'easy', objective: 219, maxScore: 445, listenSeconds: 10 },
  { difficulty: 'safe', objective: 366, maxScore: 665, listenSeconds: 10 },
];

describe('difficultyColumns', () => {
  it('de la plus facile à la plus risquée, la hauteur selon le plafond, l\'objectif à sa part du plafond', () => {
    const columns = difficultyColumns(OPTIONS);

    expect(columns.map(c => c.option.difficulty)).toEqual(['easy', 'safe', 'risky']);
    expect(columns.map(c => c.heightRatio)).toEqual([0.5, 0.75, 1]);
    expect(columns[2].objectiveRatio).toBeCloseTo(552 / 885);
    expect(columns.map(c => c.level)).toEqual([1, 2, 3]);
  });

  it('une colonne garde toujours de quoi poser son cadenas', () => {
    expect(difficultyColumns([{ difficulty: 'easy', objective: 10, maxScore: 50, listenSeconds: 10 },
      { difficulty: 'risky', objective: 900, maxScore: 2000, listenSeconds: 10 }])[0].heightRatio).toBe(0.3);
  });
});

describe('RunDifficultyComponent', () => {
  function render(options: RunDifficultyOption[] = OPTIONS) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    TestBed.inject(TranslateService).setTranslation('fr', fr);
    TestBed.inject(TranslateService).use('fr');
    const fixture = TestBed.createComponent(RunDifficultyComponent);
    fixture.componentRef.setInput('round', 2);
    fixture.componentRef.setInput('totalScore', 250);
    fixture.componentRef.setInput('options', options);
    fixture.componentRef.setInput('hand', [{ slot: 1, card: 'year' }, { slot: 2, card: 'three_choices' }]);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('« Manche 2 », « Difficulté ? », le score, et pour chaque colonne le plafond, le total atteignable, l\'objectif', () => {
    const { element } = render();
    const text = (selector: string) => [...element.querySelectorAll(selector)].map(e => e.textContent?.replace(/\s+/g, ' ').trim());

    expect(element.textContent).toContain('Manche 2');
    expect(element.textContent).toContain('Difficulté ?');
    expect(text('[data-testid="run-difficulty-score"]')).toEqual(['250']);
    expect(text('[data-testid="run-difficulty-reach"]')).toEqual(['→ 695', '→ 915', '→ 1135']);
    expect(text('[data-testid="run-difficulty-objective"]')).toEqual(['219', '366', '552']);
    expect(element.querySelector('[data-testid="run-difficulty-boss"]')).toBeNull();
    expect(element.querySelector('[data-testid="run-difficulty-hand"]')?.textContent).toContain('Année');
  });

  it('aucune colonne présélectionnée ; toucher une colonne choisit sa difficulté', () => {
    const { fixture, element } = render();
    const chosen: RunDifficulty[] = [];
    fixture.componentInstance.choose.subscribe(d => chosen.push(d));

    expect(element.querySelector('[aria-pressed="true"]')).toBeNull();
    element.querySelector<HTMLButtonElement>('[data-testid="run-difficulty-risky"]')!.click();

    expect(chosen).toEqual(['risky']);
  });

  it('la manche boss dit son écoute plus courte', () => {
    const { element } = render([...OPTIONS.slice(1), { difficulty: 'risky', objective: 1125, maxScore: 1330, listenSeconds: 5 }]);

    expect(element.querySelector('[data-testid="run-difficulty-boss"]')?.textContent?.trim()).toMatch(/^écoute 5\ss$/u);
  });
});
