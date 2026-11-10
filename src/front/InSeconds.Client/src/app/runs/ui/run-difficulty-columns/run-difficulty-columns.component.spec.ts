import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import fr from '../../../../../public/i18n/fr.json';
import { RunDifficulty, RunDifficultyOption } from '../../domain/run';
import { RunDifficultyColumnsComponent, difficultyColumns } from './run-difficulty-columns.component';

const OPTIONS: RunDifficultyOption[] = [
  { difficulty: 'risky', objective: 552, maxScore: 885, listenSeconds: 10 },
  { difficulty: 'easy', objective: 219, maxScore: 445, listenSeconds: 10 },
  { difficulty: 'safe', objective: 366, maxScore: 665, listenSeconds: 10 },
];

describe('difficultyColumns', () => {
  it('de la plus facile à la plus difficile, la hauteur selon le plafond, l\'objectif à sa part du plafond', () => {
    const columns = difficultyColumns(OPTIONS, 5);

    expect(columns.map(c => c.option.difficulty)).toEqual(['easy', 'safe', 'risky']);
    expect(columns.map(c => c.heightRatio)).toEqual([0.5, 0.75, 1]);
    expect(columns[2].objectiveRatio).toBeCloseTo(552 / 885);
    expect(columns.map(c => c.level)).toEqual([1, 2, 3]);
  });

  it('ce que vaut au mieux un morceau : le plafond de la manche partagé entre ses morceaux', () => {
    expect(difficultyColumns(OPTIONS, 5).map(c => c.perTrack)).toEqual([89, 133, 177]);
  });

  it('une colonne garde toujours de quoi poser son cadenas', () => {
    expect(difficultyColumns([{ difficulty: 'easy', objective: 10, maxScore: 50, listenSeconds: 10 },
      { difficulty: 'risky', objective: 900, maxScore: 2000, listenSeconds: 10 }])[0].heightRatio).toBe(0.3);
  });
});

describe('RunDifficultyColumnsComponent', () => {
  function render(options: RunDifficultyOption[] = OPTIONS) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    TestBed.inject(TranslateService).setTranslation('fr', fr);
    TestBed.inject(TranslateService).use('fr');
    const fixture = TestBed.createComponent(RunDifficultyColumnsComponent);
    fixture.componentRef.setInput('options', options);
    fixture.componentRef.setInput('tracksPerRound', 5);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }
  const text = (element: HTMLElement, selector: string) => [...element.querySelectorAll(selector)].map(e => e.textContent?.replace(/\s+/g, ' ').trim());

  it('Facile, Normal, Mélomane, chacun avec son objectif et ce que vaut au mieux un morceau, sans plafond ni total', () => {
    const { element } = render();

    expect(element.textContent).toContain('Facile');
    expect(element.textContent).toContain('Normal');
    expect(element.textContent).toContain('Mélomane');
    expect(element.textContent).not.toContain('Sûre');
    expect(text(element, '[data-testid="run-difficulty-objective"]')).toEqual(['219', '366', '552']);
    expect(text(element, '[data-testid="run-difficulty-per-track"]')).toEqual(['89 pts max par morceau', '133 pts max par morceau', '177 pts max par morceau']);
    expect(element.textContent).not.toContain('→');
    expect(element.querySelector('[data-testid="run-difficulty-boss"]')).toBeNull();
  });

  it('Normal est choisi d\'abord ; toucher une colonne la choisit', () => {
    const { fixture, element } = render();
    const chosen: RunDifficulty[] = [];
    fixture.componentInstance.selected.subscribe(d => chosen.push(d));

    expect(element.querySelector('[aria-checked="true"]')?.getAttribute('data-testid')).toBe('run-difficulty-safe');
    element.querySelector<HTMLButtonElement>('[data-testid="run-difficulty-risky"]')!.click();
    fixture.detectChanges();

    expect(chosen).toEqual(['risky']);
    expect(element.querySelector('[aria-checked="true"]')?.getAttribute('data-testid')).toBe('run-difficulty-risky');
  });

  it('la manche boss dit son écoute plus courte', () => {
    const { element } = render([...OPTIONS.slice(1), { difficulty: 'risky', objective: 1125, maxScore: 1330, listenSeconds: 5 }]);

    expect(element.querySelector('[data-testid="run-difficulty-boss"]')?.textContent?.trim()).toMatch(/^écoute 5\ss$/u);
  });

  it('rien ne se touche pendant l\'envoi du choix', () => {
    const { fixture, element } = render();
    fixture.componentRef.setInput('busy', true);
    fixture.detectChanges();

    expect(element.querySelector<HTMLButtonElement>('[data-testid="run-difficulty-safe"]')!.disabled).toBe(true);
  });
});
