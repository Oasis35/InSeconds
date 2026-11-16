import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import fr from '../../../../../public/i18n/fr.json';
import { RunRoundSummary } from '../../domain/run';
import { RunPalierComponent } from './run-palier.component';

describe('RunPalierComponent', () => {
  const summary = (over: Partial<RunRoundSummary> = {}): RunRoundSummary => ({
    round: 2, score: 1250, outcome: 'shorter', listenSeconds: 5, nextListenSeconds: 3, tracks: [], totalScore: 1700, livesLeft: 2, fullPoints: 200, nextFullPoints: 350, ...over,
  });

  function render(end: RunRoundSummary) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    TestBed.inject(TranslateService).setTranslation('fr', fr);
    TestBed.inject(TranslateService).use('fr');
    const fixture = TestBed.createComponent(RunPalierComponent);
    fixture.componentRef.setInput('end', end);
    fixture.componentRef.setInput('lives', 3);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('dit la manche, annonce le palier plus court et celui de la manche suivante', () => {
    const { element } = render(summary());

    expect(element.querySelector('[data-testid="run-palier-title"]')?.textContent?.trim()).toBe('Manche 2 terminée');
    expect(element.querySelector('[data-testid="run-palier-outcome"]')?.textContent?.trim()).toBe(fr.runs.roundEnd.shorter);
    expect(element.querySelector('[data-testid="run-palier-next"]')?.textContent).toContain('3');
  });

  it('une erreur rallonge le palier : le bilan le dit', () => {
    const { element } = render(summary({ outcome: 'longer', nextListenSeconds: 10 }));

    expect(element.querySelector('[data-testid="run-palier-outcome"]')?.textContent?.trim()).toBe(fr.runs.roundEnd.longer);
  });

  it('montre les vies qui restent', () => {
    const { element } = render(summary({ livesLeft: 1 }));

    expect(element.querySelectorAll('[data-testid="run-palier-lives"] svg path[fill="none"]')).toHaveLength(2);
  });

  it('« Manche suivante » émet le geste', () => {
    const { fixture, element } = render(summary());
    let clicked = 0;
    fixture.componentInstance.next.subscribe(() => clicked++);

    element.querySelector<HTMLButtonElement>('[data-testid="run-palier-next-button"]')!.click();

    expect(clicked).toBe(1);
  });

  it('le palier qui change en grand, ce que vaut un morceau, et le bouton annonce le thème qui suit', () => {
    const { fixture, element } = render(summary());

    expect(element.querySelector('[data-testid="run-palier-transition"]')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('5 s→3 s');
    expect(element.querySelector('[data-testid="run-palier-worth"]')?.textContent?.trim()).toBe('Un morceau trouvé vaut 200 → 350 pts');
    expect(element.querySelector('[data-testid="run-palier-next-button"]')?.textContent?.trim()).toBe('Manche suivante');

    fixture.componentRef.setInput('themeNext', true);
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="run-palier-next-button"]')?.textContent?.trim()).toBe('Choisir le thème');
  });
});
