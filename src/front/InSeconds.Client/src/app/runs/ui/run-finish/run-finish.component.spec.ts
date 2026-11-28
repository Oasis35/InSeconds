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
    status: 'lost', totalScore: 1284, roundsPassed: 2, foundCount: 2, trackCount: 20, livesLeft: 0, lifeBonus: 0, completeBonus: 0,
    tracks: [TRACK({ position: 1 }), TRACK({ position: 2 }), TRACK({ position: 6, round: 2, titleCorrect: false })],
    rounds: [
      { round: 1, score: 400, listenSeconds: 10, theme: null },
      { round: 2, score: 466, listenSeconds: 5, theme: null },
      { round: 3, score: 418, listenSeconds: 3, theme: null },
      { round: 4, score: null, listenSeconds: 2, theme: null },
    ],
    record: { bestScore: 2617, bestRoundsPassed: 4, isNew: false }, challengeCode: 'ABC234',
    level: null, ...overrides,
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

  it('une défaite : les manches passées, le record, le score au format de la langue, les morceaux trouvés et 20 carrés', () => {
    const { element } = render(finish());

    expect(text(element, 'run-disc')).toBe('runs.finished.rounds');
    expect(text(element, 'run-record')).toBe('runs.finished.record');
    expect(text(element, 'run-final-score')?.replace(/\s/g, ' ')).toBe('1 284');
    expect(text(element, 'run-found')).toBe('runs.finished.found');
    expect(element.querySelectorAll('[data-testid="run-squares"] [data-state]')).toHaveLength(20);
    expect(element.querySelectorAll('[data-testid="run-squares"] [data-state="found"]')).toHaveLength(2);
  });

  it('une Série complète : le titre et le détail des bonus (vies restantes, complétion)', () => {
    const { element } = render(finish({ status: 'completed', livesLeft: 2, lifeBonus: 500, completeBonus: 500, roundsPassed: 8 }));

    expect(text(element, 'run-disc')).toBe('runs.finished.complete');
    expect(text(element, 'run-bonus-lives')).toBe('runs.finished.bonusLives');
    expect(text(element, 'run-bonus-complete')).toBe('runs.finished.bonusComplete');
  });

  it('une partie perdue n\'a aucun bonus', () => {
    expect(render(finish()).element.querySelector('[data-testid="run-bonus"]')).toBeNull();
  });

  it('un nouveau record se dit', () => {
    const { element } = render(finish({ record: { bestScore: 2617, bestRoundsPassed: 4, isNew: true } }));

    expect(text(element, 'run-record')).toBe('runs.finished.newRecord');
  });

  it('une case par manche : son score et son palier, ✕ pour une manche non jouée', () => {
    const { element } = render(finish());
    const cases = element.querySelectorAll('[data-testid="run-round-scores"] [data-round]');

    expect(cases).toHaveLength(4);
    expect(cases[0].textContent).toContain('400');
    expect(cases[3].textContent).toContain('✕');
  });

  it('« Rejouer » en action principale, avant le partage', () => {
    const { element } = render(finish());
    const again = element.querySelector<HTMLElement>('[data-testid="run-play-again"]')!;

    expect(text(element, 'run-play-again')).toBe('runs.finished.playAgain');
    expect(again.classList).toContain('app-button--primary');
    expect(again.compareDocumentPosition(element.querySelector('[data-testid="run-share"]')!) & Node.DOCUMENT_POSITION_FOLLOWING).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('« Rejouer » est le seul bouton principal : le partage passe en contour neutre, sans lueur ; sans accès, le partage reste principal', () => {
    const shareButton = (element: HTMLElement) => element.querySelector<HTMLElement>('[data-testid="run-share"] button')!;

    expect(shareButton(render(finish()).element).classList).toContain('app-button--neutral');
    TestBed.resetTestingModule();
    expect(shareButton(render(finish(), false).element).classList).toContain('app-button--primary');
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

  it('sans accès, le jeu du jour à la place de « Rejouer »', () => {
    const { element } = render(finish(), false);

    expect(element.querySelector('[data-testid="run-play-again"]')).toBeNull();
    expect(element.querySelector('[data-testid="run-to-daily"]')?.getAttribute('href')).toBe('/');
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

    for (const [part, count] of [['finish-score', 1], ['finish-record', 1], ['finish-square', 20], ['finish-round', 4]] as const)
      expect(element.querySelectorAll(`[data-motion="${part}"]`), part).toHaveLength(count);
    expect(element.querySelector<HTMLButtonElement>('[data-testid="run-play-again"]')?.disabled).toBe(false);
  });

  describe('nouvelle interface (niveau)', () => {
    const level = { points: 1380, disc: { key: 'runs.discs.silver', stars: 0 }, nextDisc: { key: 'runs.discs.gold', stars: 0 }, pointsToNext: 220, progressPercent: 56, runsPlayed: 12, delta: 38, discChange: 'same' as const, inactivityLoss: 0, discDropInDays: null };

    function renderLevel(value: RunFinish, showLevel: boolean, duel: RunDuel | null = null) {
      const rendered = render(value, true, duel);
      rendered.fixture.componentRef.setInput('showLevel', showLevel);
      rendered.fixture.componentRef.setInput('reviewLink', '/history/survie/7');
      rendered.fixture.detectChanges();
      return rendered;
    }

    it('le bloc compact (disque, score, jauge), « Rejouer », « Défier un ami » et « Revoir » vers la partie', () => {
      const { element } = renderLevel(finish({ level }), true);

      expect(element.querySelector('[data-testid="run-level"]')?.getAttribute('data-disc')).toBe('runs.discs.silver');
      expect(text(element, 'run-level-delta')).toBe('+38');
      expect(text(element, 'run-play-again-label')).toBe('runs.finished.playAgain');
      expect(text(element, 'run-next-disc')).toContain('runs.level.encorePoints');
      expect(text(element, 'run-found')).toBe('runs.finished.found');
      expect(element.querySelector('[data-testid="run-round-scores"]')).toBeNull();
      expect(text(element, 'run-share')).toContain('runs.level.challenge');
      expect((element.querySelector('[data-testid="run-level-bar"]') as HTMLElement).style.width).toBe('56%');
      expect(element.querySelector('app-run-level-card')).toBeNull();
      expect(element.querySelector('[data-testid="run-level-review"]')?.getAttribute('href')).toBe('/history/survie/7');
    });

    it('défi du jour à jouer : « Rejouer » passe en contour et la bande du défi monte au-dessus des actions ; sinon « Rejouer » reste plein', () => {
      const again = (element: HTMLElement) => element.querySelector<HTMLElement>('[data-testid="run-play-again"]')!;
      const band = (element: HTMLElement) => element.querySelector<HTMLElement>('[data-testid="finish-bottom"]')!;

      const first = renderLevel(finish({ level }), true);
      first.fixture.componentRef.setInput('dailyFirst', true);
      first.fixture.detectChanges();
      expect(again(first.element).classList).toContain('app-button--accent');
      expect(band(first.element).style.order).toBe('-1');

      TestBed.resetTestingModule();
      const done = renderLevel(finish({ level }), true);
      expect(again(done.element).classList).toContain('app-button--primary');
      expect(band(done.element).style.order).toBe('0');
    });

    it('en duel, l\'action principale reste « Revanche »', () => {
      const { element } = renderLevel(finish({ level }), true, { pseudo: 'Léa', gap: 126 });

      expect(text(element, 'run-play-again')).toBe('runs.finished.rematch');
    });

    it('un disque gagné : « Tu passes au disque rayé » en ambre, avec les points', () => {
      const up = { ...level, points: 300, disc: { key: 'runs.discs.scratched', stars: 0 }, delta: 300, discChange: 'up' as const };
      const { element } = renderLevel(finish({ level: up }), true);

      const change = element.querySelector<HTMLElement>('[data-testid="run-level-change"]');
      expect(change?.getAttribute('data-change')).toBe('up');
      expect(change?.textContent).toContain('runs.level.discUp');
    });

    it('une mauvaise série : le disque gardé, les points et « au plus 10 % » ; un disque perdu le dit', () => {
      const bad = { ...level, points: 2286, delta: -254, discChange: 'same' as const };
      const { element } = renderLevel(finish({ level: bad }), true);
      expect(element.querySelector('[data-testid="run-level-change"]')?.getAttribute('data-change')).toBe('bad');
      expect(text(element, 'run-level-change')).toContain('runs.level.badRun');

      TestBed.resetTestingModule();
      const lost = { ...level, points: 280, disc: { key: 'runs.discs.none', stars: 0 }, delta: -31, discChange: 'down' as const };
      const lostScreen = renderLevel(finish({ level: lost }), true).element;
      expect(text(lostScreen, 'run-level-change')).toContain('runs.level.discLost');
    });

    it('une série sans changement de disque ni baisse : pas de ligne', () => {
      const { element } = renderLevel(finish({ level }), true);
      expect(element.querySelector('[data-testid="run-level-change"]')).toBeNull();
    });

    it('« 1 manche terminée » au singulier', () => {
      const { element } = renderLevel(finish({ level, roundsPassed: 1 }), true);
      expect(text(element, 'run-disc')).toBe('runs.finished.roundsOne');
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
