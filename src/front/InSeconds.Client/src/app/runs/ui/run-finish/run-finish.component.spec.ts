import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { RunDuel, RunFinish } from '../../domain/run';
import { TRACK } from '../../data-access/testing/fake-runs-api';
import { RunFinishComponent } from './run-finish.component';

describe('RunFinishComponent', () => {
  // La séquence de fin (GSAP) a ses propres tests dans motion.spec.ts : ici, tout est posé d'emblée.
  const flag = globalThis.window as { __disableAnimations?: boolean };
  beforeEach(() => { flag.__disableAnimations = true; });
  afterEach(() => { delete flag.__disableAnimations; });

  const finish = (overrides: Partial<RunFinish> = {}): RunFinish => ({
    status: 'lost', disc: { key: 'runs.discs.bronze', stars: 0 }, totalScore: 1284, roundsPassed: 2, foundCount: 2, trackCount: 20,
    tracks: [TRACK({ position: 1 }), TRACK({ position: 2 }), TRACK({ position: 6, round: 2, titleCorrect: false })],
    rounds: [
      { round: 1, score: 400, objective: 200, passed: true, difficulty: 'safe' },
      { round: 2, score: 466, objective: 333, passed: true, difficulty: 'risky' },
      { round: 3, score: 418, objective: 501, passed: false, difficulty: 'easy' },
      { round: 4, score: null, objective: null, passed: false, difficulty: null },
    ],
    record: { bestScore: 2617, bestRoundsPassed: 4, isNew: false }, challengeCode: 'ABC234',
    shortfall: { points: 83, disc: { key: 'runs.discs.silver', stars: 0 } }, level: null, ...overrides,
  });

  function render(value: RunFinish, canPlayAgain = true, duel: RunDuel | null = null) {
    TestBed.configureTestingModule({ providers: [provideTranslateService(), provideRouter([])] });
    const fixture = TestBed.createComponent(RunFinishComponent);
    fixture.componentRef.setInput('finish', value);
    fixture.componentRef.setInput('duel', duel);
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

  it('« Rejouer » en action principale, avec ce qui a manqué pour le disque suivant, avant le partage', () => {
    const { element } = render(finish());
    const again = element.querySelector<HTMLElement>('[data-testid="run-play-again"]')!;

    expect(text(element, 'run-play-again')).toBe('runs.finished.playAgain');
    expect(again.classList).toContain('app-button--primary');
    expect(text(element, 'run-shortfall')).toBe('runs.finished.shortfallBefore runs.finished.shortfallPoints runs.finished.shortfallAfter');
    expect(again.compareDocumentPosition(element.querySelector('[data-testid="run-share"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('« Rejouer » est le seul bouton principal : le partage passe en contour neutre, sans lueur ; sans accès, le partage reste principal', () => {
    const shareButton = (element: HTMLElement) => element.querySelector<HTMLElement>('[data-testid="run-share"] button')!;

    expect(shareButton(render(finish()).element).classList).toContain('app-button--neutral');
    TestBed.resetTestingModule();
    expect(shareButton(render(finish(), false).element).classList).toContain('app-button--primary');
  });

  it('une victoire : rien n\'a manqué', () => {
    const { element } = render(finish({ status: 'won', shortfall: null }));

    expect(element.querySelector('[data-testid="run-shortfall"]')).toBeNull();
  });

  it('« Partager mon score » et « Rejouer »', () => {
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

  it('sans accès, le jeu du jour à la place de « Rejouer », sans ce qui a manqué', () => {
    const { element } = render(finish(), false);

    expect(element.querySelector('[data-testid="run-play-again"]')).toBeNull();
    expect(element.querySelector('[data-testid="run-shortfall"]')).toBeNull();
    expect(element.querySelector('[data-testid="run-to-daily"]')?.getAttribute('href')).toBe('/daily');
  });
  it('un duel ouvre l\'écran, sur un ton neutre : avance, retard ou égalité, et « Revanche » à la place de « Rejouer »', () => {
    for (const gap of [126, -40, 0]) {
      TestBed.resetTestingModule();
      const { element } = render(finish(), true, { pseudo: 'Léa', gap });

      const duel = element.querySelector('[data-testid="run-duel"]');
      expect(duel?.getAttribute('data-gap')).toBe(String(gap));
      expect(duel?.textContent?.trim()).toBe(gap > 0 ? 'runs.finished.duelAhead' : gap < 0 ? 'runs.finished.duelBehind' : 'runs.finished.duelTied');
      expect(text(element, 'run-play-again')).toBe('runs.finished.rematch');
    }
  });

  it('sans ami, ni duel ni revanche : « Rejouer »', () => {
    const { element } = render(finish());

    expect(element.querySelector('[data-testid="run-duel"]')).toBeNull();
    expect(text(element, 'run-play-again')).toBe('runs.finished.playAgain');
  });

  it('la séquence de fin marque ses éléments, et rien n\'attend : « Rejouer » est actif dès le début', () => {
    const { element } = render(finish({ record: { bestScore: 1284, bestRoundsPassed: 2, isNew: true } }));

    for (const [part, count] of [['finish-disc', 1], ['finish-score', 1], ['finish-record', 1], ['finish-square', 20], ['finish-round', 4]] as const)
      expect(element.querySelectorAll(`[data-motion="${part}"]`), part).toHaveLength(count);
    expect(element.querySelector<HTMLButtonElement>('[data-testid="run-play-again"]')?.disabled).toBe(false);
  });

  describe('nouvelle interface (niveau)', () => {
    const level = { points: 1380, disc: { key: 'runs.discs.silver', stars: 0 }, nextDisc: { key: 'runs.discs.gold', stars: 0 }, pointsToNext: 220, progressPercent: 56, provisional: false, runsPlayed: 12, delta: 38 };

    function renderLevel(value: RunFinish, showLevel: boolean, duel: RunDuel | null = null) {
      const rendered = render(value, true, duel);
      rendered.fixture.componentRef.setInput('showLevel', showLevel);
      rendered.fixture.componentRef.setInput('reviewLink', '/setlist/history/7');
      rendered.fixture.detectChanges();
      return rendered;
    }

    it('la carte du niveau, « Nouvelle setlist », « Défier un ami » et « Revoir » vers la partie', () => {
      const { element } = renderLevel(finish({ level }), true);

      expect(element.querySelector('[data-testid="run-level"]')?.getAttribute('data-disc')).toBe('runs.discs.silver');
      expect(text(element, 'run-level-delta')).toBe('+38');
      expect(text(element, 'run-play-again')).toBe('runs.level.newSetlist');
      expect(text(element, 'run-share')).toContain('runs.level.challenge');
      expect(element.querySelector('[data-testid="run-level-review"]')?.getAttribute('href')).toBe('/setlist/history/7');
    });

    it('en duel, l\'action principale reste « Revanche »', () => {
      const { element } = renderLevel(finish({ level }), true, { pseudo: 'Léa', gap: 126 });

      expect(text(element, 'run-play-again')).toBe('runs.finished.rematch');
    });

    it('sans la nouvelle interface, ou sans niveau (partie abandonnée) : l\'écran d\'avant', () => {
      for (const { element } of [renderLevel(finish({ level }), false)]) {
        expect(element.querySelector('[data-testid="run-level"]')).toBeNull();
        expect(text(element, 'run-play-again')).toBe('runs.finished.playAgain');
      }
      TestBed.resetTestingModule();
      const { element } = renderLevel(finish({ level: null }), true);
      expect(element.querySelector('[data-testid="run-level"]')).toBeNull();
      expect(text(element, 'run-share')).toContain('runs.finished.share');
    });
  });
});
