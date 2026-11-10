import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import fr from '../../../../../public/i18n/fr.json';
import { RunDifficulty, RunDifficultyOption } from '../../domain/run';
import { RunCardKey } from '../../domain/run-cards';
import { RunPalierComponent } from './run-palier.component';

describe('RunPalierComponent', () => {
  function render(overrides: { earned?: RunCardKey | null; options?: RunDifficultyOption[] } = {}) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    TestBed.inject(TranslateService).setTranslation('fr', fr);
    TestBed.inject(TranslateService).use('fr');
    const fixture = TestBed.createComponent(RunPalierComponent);
    const set = fixture.componentRef.setInput.bind(fixture.componentRef);
    set('passed', { round: 1, score: 250, objective: 200, disc: { key: 'runs.discs.wax', stars: 0 } });
    set('rounds', 4);
    set('wonDiscs', ['runs.discs.wax']);
    set('nextRound', 2);
    set('nextObjective', 366);
    set('nextDisc', 'runs.discs.bronze');
    set('earnedCard', overrides.earned === undefined ? 'hint' : overrides.earned);
    set('values', { extendBonusSeconds: 5, rewardMarginPercent: 25 });
    if (overrides.options) set('options', overrides.options);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const text = (testId: string) => element.querySelector(`[data-testid="${testId}"]`)?.textContent?.replace(/\s+/g, ' ').trim();
    return { fixture, element, text };
  }

  it('le disque gagné, le score de la manche (qui monte jusqu\'à lui) et l\'objectif suivant', async () => {
    const { element, text } = render();

    expect(text('run-palier-disc')).toBe('Disque de cire');
    await vi.waitFor(() => expect(text('run-palier-score')).toBe('250'));
    expect(text('run-palier-next')).toContain('366');
    expect(text('run-palier-next')).toContain('pts pour');
    // L'étagère : le disque gagné, puis trois emplacements en pointillé.
    expect(element.querySelectorAll('ul[aria-label] > li app-run-disc')).toHaveLength(1);
    expect(element.querySelectorAll('ul[aria-label] > li')).toHaveLength(4);
  });

  it('la carte gagnée : son signe, son nom et la mention « Carte gagnée »', () => {
    const { text } = render({ earned: 'extend' });

    expect(text('run-palier-earned')).toBe('+5 sCarte gagnéeProlongation');
  });

  it('une manche qui n\'a rien rapporté : pas de carte', () => {
    const { element } = render({ earned: null });

    expect(element.querySelector('[data-testid="run-palier-earned"]')).toBeNull();
  });

  it('« Suite » : la page reçoit le geste (aucune carte à toucher, aucune offre à passer)', () => {
    const { fixture, element } = render();
    let next = 0;
    fixture.componentInstance.next.subscribe(() => next++);

    element.querySelector<HTMLButtonElement>('[data-testid="run-palier-next-button"]')!.click();

    expect(next).toBe(1);
    expect(element.querySelector('[data-testid="run-palier-pass"]')).toBeNull();
    expect(element.querySelector('[data-card]')).toBeNull();
  });

  describe('avec les difficultés de la manche suivante (un seul écran)', () => {
    const OPTIONS: RunDifficultyOption[] = [
      { difficulty: 'easy', objective: 219, maxScore: 445, listenSeconds: 10 },
      { difficulty: 'safe', objective: 366, maxScore: 665, listenSeconds: 10 },
      { difficulty: 'risky', objective: 552, maxScore: 885, listenSeconds: 10 },
    ];

    it('les trois colonnes remplacent l\'objectif seul, et le bouton du bas dit « Jouer »', () => {
      const { element, text } = render({ options: OPTIONS });

      expect(element.querySelectorAll('[data-testid="run-difficulty-objective"]')).toHaveLength(3);
      expect(element.querySelector('[data-testid="run-palier-next"]')).toBeNull();
      expect(text('run-palier-next-button')).toBe('Jouer');
    });

    it('« Jouer » envoie Normal, ou la colonne touchée ; « Suite » n\'est pas émis', () => {
      const { fixture, element } = render({ options: OPTIONS });
      const chosen: RunDifficulty[] = [];
      let next = 0;
      fixture.componentInstance.choose.subscribe(d => chosen.push(d));
      fixture.componentInstance.next.subscribe(() => next++);

      element.querySelector<HTMLButtonElement>('[data-testid="run-palier-next-button"]')!.click();
      element.querySelector<HTMLButtonElement>('[data-testid="run-difficulty-risky"]')!.click();
      fixture.detectChanges();
      element.querySelector<HTMLButtonElement>('[data-testid="run-palier-next-button"]')!.click();

      expect(chosen).toEqual(['safe', 'risky']);
      expect(next).toBe(0);
    });
  });
});
