import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import fr from '../../../../../public/i18n/fr.json';
import { RunDifficulty, RunDifficultyOption } from '../../domain/run';
import { RunDifficultyComponent } from './run-difficulty.component';

const OPTIONS: RunDifficultyOption[] = [
  { difficulty: 'easy', objective: 219, maxScore: 445, listenSeconds: 10 },
  { difficulty: 'safe', objective: 366, maxScore: 665, listenSeconds: 10 },
  { difficulty: 'risky', objective: 552, maxScore: 885, listenSeconds: 10 },
];

describe('RunDifficultyComponent', () => {
  function render(options: RunDifficultyOption[] = OPTIONS) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    TestBed.inject(TranslateService).setTranslation('fr', fr);
    TestBed.inject(TranslateService).use('fr');
    const fixture = TestBed.createComponent(RunDifficultyComponent);
    fixture.componentRef.setInput('round', 2);
    fixture.componentRef.setInput('totalScore', 250);
    fixture.componentRef.setInput('options', options);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('« Manche 2 », « Difficulté ? », le score et les trois difficultés', () => {
    const { element } = render();

    expect(element.textContent).toContain('Manche 2');
    expect(element.textContent).toContain('Difficulté ?');
    expect(element.querySelector('[data-testid="run-difficulty-score"]')?.textContent?.trim()).toBe('250');
    expect(element.querySelectorAll('[data-testid="run-difficulty-objective"]')).toHaveLength(3);
    expect(element.querySelector('[data-testid="run-difficulty-hand"]')).toBeNull();
  });

  it('« Jouer » envoie Normal sans rien toucher', () => {
    const { fixture, element } = render();
    const chosen: RunDifficulty[] = [];
    fixture.componentInstance.choose.subscribe(d => chosen.push(d));

    element.querySelector<HTMLButtonElement>('[data-testid="run-difficulty-play"]')!.click();

    expect(chosen).toEqual(['safe']);
  });

  it('toucher une colonne la choisit, « Jouer » envoie ce choix', () => {
    const { fixture, element } = render();
    const chosen: RunDifficulty[] = [];
    fixture.componentInstance.choose.subscribe(d => chosen.push(d));

    element.querySelector<HTMLButtonElement>('[data-testid="run-difficulty-risky"]')!.click();
    fixture.detectChanges();
    expect(chosen).toEqual([]);
    element.querySelector<HTMLButtonElement>('[data-testid="run-difficulty-play"]')!.click();

    expect(chosen).toEqual(['risky']);
  });

  it('sans Normal dans la manche, la première difficulté offerte est choisie', () => {
    const { fixture, element } = render([OPTIONS[0], OPTIONS[2]]);
    const chosen: RunDifficulty[] = [];
    fixture.componentInstance.choose.subscribe(d => chosen.push(d));

    element.querySelector<HTMLButtonElement>('[data-testid="run-difficulty-play"]')!.click();

    expect(chosen).toEqual(['easy']);
  });

  it('« Jouer » ne part pas pendant l\'envoi du choix', () => {
    const { fixture, element } = render();
    fixture.componentRef.setInput('busy', true);
    fixture.detectChanges();

    expect(element.querySelector<HTMLButtonElement>('[data-testid="run-difficulty-play"]')!.disabled).toBe(true);
  });
});
