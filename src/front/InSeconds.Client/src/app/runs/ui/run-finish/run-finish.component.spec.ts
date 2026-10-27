import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { RunFinish } from '../../domain/run';
import { TRACK } from '../../data-access/testing/fake-runs-api';
import { RunFinishComponent } from './run-finish.component';

describe('RunFinishComponent', () => {
  const finish = (overrides: Partial<RunFinish> = {}): RunFinish => ({
    status: 'lost', disc: { key: 'runs.discs.bronze', stars: 0 }, totalScore: 1284, roundsPassed: 2, foundCount: 2, trackCount: 20,
    tracks: [TRACK({ position: 1 }), TRACK({ position: 2 }), TRACK({ position: 6, round: 2, titleCorrect: false })],
    rounds: [
      { round: 1, score: 400, objective: 200, passed: true },
      { round: 2, score: 466, objective: 333, passed: true },
      { round: 3, score: 418, objective: 501, passed: false },
      { round: 4, score: null, objective: null, passed: false },
    ],
    record: { bestScore: 2617, bestRoundsPassed: 4, isNew: false }, challengeCode: 'ABC234', ...overrides,
  });

  function render(value: RunFinish, canPlayAgain = true) {
    TestBed.configureTestingModule({ providers: [provideTranslateService(), provideRouter([])] });
    const fixture = TestBed.createComponent(RunFinishComponent);
    fixture.componentRef.setInput('finish', value);
    fixture.componentRef.setInput('canPlayAgain', canPlayAgain);
    fixture.componentRef.setInput('lang', 'fr');
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  const text = (element: HTMLElement, id: string) => element.querySelector(`[data-testid="${id}"]`)?.textContent?.replace(/\s+/g, ' ').trim();

  it('une défaite : le disque obtenu, le record, le score au format de la langue, les morceaux trouvés et 20 carrés', () => {
    const { element } = render(finish());

    expect(element.querySelector('[data-disc]')?.getAttribute('data-disc')).toBe('runs.discs.bronze');
    expect(text(element, 'run-disc')).toBe('runs.finished.disc');
    expect(text(element, 'run-record')).toBe('runs.finished.record');
    expect(text(element, 'run-final-score')?.replace(/\s/g, ' ')).toBe('1 284');
    expect(text(element, 'run-found')).toBe('runs.finished.found');
    expect(element.querySelectorAll('[data-testid="run-squares"] [data-state]')).toHaveLength(20);
    expect(element.querySelectorAll('[data-testid="run-squares"] [data-state="found"]')).toHaveLength(2);
  });

  it('une victoire annonce le disque et le nouveau record', () => {
    const { element } = render(finish({ status: 'won', disc: { key: 'runs.discs.gold', stars: 0 }, record: { bestScore: 2617, bestRoundsPassed: 4, isNew: true } }));

    expect(text(element, 'run-disc')).toBe('runs.finished.won');
    expect(text(element, 'run-record')).toBe('runs.finished.newRecord');
  });

  it('une case par manche : score / objectif, l\'objectif manqué en ambre, ✕ pour une manche non jouée', () => {
    const { element } = render(finish());
    const cases = element.querySelectorAll('[data-testid="run-round-scores"] [data-round]');

    expect(cases).toHaveLength(4);
    expect(cases[0].textContent).toContain('400');
    expect(cases[0].textContent).toContain('/ 200');
    expect((cases[2].querySelector('span:last-child') as HTMLElement).style.color).toBe('var(--color-warn)');
    expect(cases[3].textContent).toContain('✕');
  });

  it('« Partager la playlist » et « Nouvelle partie »', () => {
    const { fixture, element } = render(finish());
    const share = vi.fn();
    const again = vi.fn();
    fixture.componentInstance.share.subscribe(share);
    fixture.componentInstance.playAgain.subscribe(again);

    (element.querySelector('[data-testid="run-share"] button') as HTMLButtonElement).click();
    (element.querySelector('[data-testid="run-play-again"]') as HTMLButtonElement).click();

    expect(share).toHaveBeenCalled();
    expect(again).toHaveBeenCalled();
  });

  it('« Voir les autres joueurs » ouvre la comparaison de la playlist', () => {
    const { fixture, element } = render(finish());
    const compare = vi.fn();
    fixture.componentInstance.compare.subscribe(compare);

    (element.querySelector('[data-testid="run-compare"]') as HTMLButtonElement).click();

    expect(compare).toHaveBeenCalledTimes(1);
  });

  it('sans accès, le jeu du jour à la place de « Nouvelle partie »', () => {
    const { element } = render(finish(), false);

    expect(element.querySelector('[data-testid="run-play-again"]')).toBeNull();
    expect(element.querySelector('[data-testid="run-to-daily"]')?.getAttribute('href')).toBe('/daily');
  });
});
