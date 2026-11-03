import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import fr from '../../../../../public/i18n/fr.json';
import { RunRound } from '../../domain/run';
import { RunHeaderComponent } from './run-header.component';

describe('RunHeaderComponent', () => {
  function render(round: RunRound = { round: 2, score: 100, objective: 250, maxScore: 500 }) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    TestBed.inject(TranslateService).setTranslation('fr', fr);
    TestBed.inject(TranslateService).use('fr');
    const fixture = TestBed.createComponent(RunHeaderComponent);
    fixture.componentRef.setInput('round', round);
    fixture.componentRef.setInput('rounds', 4);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('la barre du run : la manche passée, la manche en cours remplie de son score, les suivantes fermées', () => {
    const { element } = render();

    const segments = [...element.querySelectorAll('[data-testid="run-bar"] > div')];
    expect(segments.map(s => s.getAttribute('data-state'))).toEqual(['done', 'current', 'locked', 'locked']);
    expect((segments[1].firstElementChild as HTMLElement).style.width).toBe('20%');
    expect(element.querySelector('[data-testid="run-bar"]')?.getAttribute('aria-label')).toBe('Manche 2 / 4');
  });

  it('« Manche 2 » et ce qui manque pour passer, sans score total', () => {
    const { element } = render();

    expect(element.querySelector('[data-testid="run-round-title"]')?.textContent?.trim()).toBe('Manche 2');
    expect(element.querySelector('[data-testid="run-to-go"]')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('encore 150 pts pour passer');
    expect(element.querySelector('[data-testid="run-total-score"]')).toBeNull();
  });

  it('l\'objectif atteint le dit', () => {
    const { element } = render({ round: 1, score: 260, objective: 200, maxScore: 500 });

    expect(element.querySelector('[data-testid="run-to-go"]')?.textContent?.trim()).toBe('objectif atteint');
  });

  it('✕ est un bouton nommé qui demande l\'abandon à la page', () => {
    const { fixture, element } = render();
    const abandon = vi.fn();
    fixture.componentInstance.abandon.subscribe(abandon);

    const button = element.querySelector('[data-testid="run-abandon"]') as HTMLButtonElement;
    expect(button.getAttribute('aria-label')).toBe('Abandonner');
    button.click();

    expect(abandon).toHaveBeenCalledTimes(1);
  });

  it('le titre de la manche est le seul titre de la page', () => {
    expect(render().element.querySelectorAll('h1')).toHaveLength(1);
  });
});
