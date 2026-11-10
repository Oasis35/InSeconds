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

  it('toucher une colonne envoie sa difficulté tout de suite, sans bouton « Jouer »', () => {
    const { fixture, element } = render();
    const chosen: RunDifficulty[] = [];
    fixture.componentInstance.choose.subscribe(d => chosen.push(d));

    expect(element.querySelector('[data-testid="run-difficulty-play"]')).toBeNull();
    element.querySelector<HTMLButtonElement>('[data-testid="run-difficulty-risky"]')!.click();

    expect(chosen).toEqual(['risky']);
  });

  it('Normal est présélectionné (aria-pressed), même sans toucher', () => {
    const { element } = render();

    expect(element.querySelector('[data-testid="run-difficulty-safe"]')?.getAttribute('aria-pressed')).toBe('true');
  });

  it('les colonnes ne se touchent plus pendant l\'envoi du choix', () => {
    const { fixture, element } = render();
    fixture.componentRef.setInput('busy', true);
    fixture.detectChanges();

    expect(element.querySelector<HTMLButtonElement>('[data-testid="run-difficulty-risky"]')!.disabled).toBe(true);
  });
});
