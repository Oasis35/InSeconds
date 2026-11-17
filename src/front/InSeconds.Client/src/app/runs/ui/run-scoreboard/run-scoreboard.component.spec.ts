import { gsap } from 'gsap';
import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import fr from '../../../../../public/i18n/fr.json';
import { RoundDot, RunGhostGap } from '../../domain/run';
import { RunScoreboardComponent } from './run-scoreboard.component';

describe('RunScoreboardComponent', () => {
  function render(opts: { total?: number; ghost?: RunGhostGap | null; combo?: number | null; theme?: string | null; dots?: RoundDot[]; ladder?: number[]; listen?: number; maxRounds?: number } = {}) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    TestBed.inject(TranslateService).setTranslation('fr', fr);
    TestBed.inject(TranslateService).use('fr');
    const fixture = TestBed.createComponent(RunScoreboardComponent);
    fixture.componentRef.setInput('total', opts.total ?? 300);
    fixture.componentRef.setInput('round', 2);
    fixture.componentRef.setInput('maxRounds', opts.maxRounds ?? 0);
    fixture.componentRef.setInput('theme', opts.theme ?? null);
    fixture.componentRef.setInput('ghost', opts.ghost ?? null);
    fixture.componentRef.setInput('combo', opts.combo ?? null);
    fixture.componentRef.setInput('dots', opts.dots ?? []);
    fixture.componentRef.setInput('ladder', opts.ladder ?? []);
    fixture.componentRef.setInput('listenSeconds', opts.listen ?? 0);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }
  const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim();

  it('le score posé tel quel au premier affichage, « Manche N » et son thème', () => {
    const { element } = render({ theme: 'Années 80' });

    expect(element.querySelector('[data-testid="run-total-score"]')?.textContent).toBe('300');
    expect(text(element.querySelector('[data-testid="run-round-title"]'))).toBe('Manche 2 Années 80');
    expect(element.querySelectorAll('h1')).toHaveLength(1);
    expect(element.querySelector('[data-testid="run-theme-pill"]')?.textContent?.trim()).toBe('Années 80');
  });

  it('avec un plafond de manches, « Manche 2/8 »', () => {
    const { element } = render({ maxRounds: 8 });

    expect(text(element.querySelector('[data-testid="run-round-title"]'))).toBe('Manche 2/8');
  });

  it('une pastille par morceau, avec son état', () => {
    const { element } = render({ dots: ['found', 'half', 'missed', 'current', 'upcoming'] });

    expect([...element.querySelectorAll('[data-testid="run-dots"] li')].map(li => li.getAttribute('data-dot')))
      .toEqual(['found', 'half', 'missed', 'current', 'upcoming']);
  });

  it('la rangée des paliers allume celui de la manche', () => {
    const { element } = render({ ladder: [10, 5, 3, 2, 1, 0.5], listen: 3 });

    expect([...element.querySelectorAll('[data-testid="run-ladder"] li')].map(li => li.textContent?.trim())).toEqual(['10', '5', '3', '2', '1', '0,5']);
    expect(element.querySelector('[data-testid="run-listen"]')?.textContent?.trim()).toBe('3');
  });

  it('sans échelle, pas de rangée des paliers', () => {
    expect(render({ ladder: [] }).element.querySelector('[data-testid="run-ladder"]')).toBeNull();
  });

  it('le fantôme d\'un ami : son total, en violet, et l\'avance ou le retard du joueur ; rien sans fantôme', () => {
    const line = (ghost: RunGhostGap) => {
      TestBed.resetTestingModule();
      return render({ ghost }).element.querySelector<HTMLElement>('[data-testid="run-ghost"]')!;
    };
    expect(render().element.querySelector('[data-testid="run-ghost"]')).toBeNull();

    const ahead = line({ pseudo: 'Alice', total: 1240, gap: 1060, stoppedAtRound: null });
    expect(text(ahead)).toBe('Alice 1 240 1 060 pts d’avance');
    expect((ahead.firstElementChild as HTMLElement).style.color).toBe('var(--color-violet)');
    expect(text(line({ pseudo: null, total: 340, gap: -40, stoppedAtRound: null }))).toBe('Invité 340 40 pts de retard');
    expect(text(line({ pseudo: 'Alice', total: 300, gap: 0, stoppedAtRound: null }).querySelector('[data-testid="run-ghost-gap"]'))).toBe('À égalité');
    expect(text(line({ pseudo: 'Alice', total: 300, gap: 900, stoppedAtRound: 2 }).querySelector('[data-testid="run-ghost-stopped"]'))).toBe('arrêt en manche 2');
  });

  it('passer devant l\'ami : « Tu viens de dépasser » quelques secondes', () => {
    vi.useFakeTimers();
    const { fixture, element } = render({ ghost: { pseudo: 'Alice', total: 300, gap: -50, stoppedAtRound: null } });
    expect(element.querySelector('[data-testid="run-overtook"]')).toBeNull();

    fixture.componentRef.setInput('ghost', { pseudo: 'Alice', total: 300, gap: 80, stoppedAtRound: null });
    fixture.detectChanges();
    vi.advanceTimersByTime(1400);
    fixture.detectChanges();
    expect(text(element.querySelector('[data-testid="run-overtook"]'))).toBe('Tu viens de dépasser Alice !');

    vi.advanceTimersByTime(4000);
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="run-overtook"]')).toBeNull();
    vi.useRealTimers();
  });

  it('l\'écart change quand le total a fini de compter, pas avant', () => {
    vi.useFakeTimers();
    const { fixture, element } = render({ ghost: { pseudo: 'Alice', total: 300, gap: 0, stoppedAtRound: null } });
    const gap = () => text(element.querySelector('[data-testid="run-ghost-gap"]'));
    expect(gap()).toBe('À égalité');

    fixture.componentRef.setInput('total', 400);
    fixture.componentRef.setInput('ghost', { pseudo: 'Alice', total: 300, gap: 100, stoppedAtRound: null });
    fixture.detectChanges();
    expect(gap()).toBe('À égalité');

    vi.advanceTimersByTime(1400);
    fixture.detectChanges();
    expect(gap()).toBe('100 pts d’avance');
    vi.useRealTimers();
  });

  it('la série de bonnes réponses, à la couleur du joueur ; rien sans série', () => {
    expect(render().element.querySelector('[data-testid="run-combo"]')).toBeNull();
    TestBed.resetTestingModule();

    const chip = render({ combo: 3 }).element.querySelector<HTMLElement>('[data-testid="run-combo"]')!;
    expect(chip.textContent?.trim()).toBe('3 d’affilée');
    expect(chip.style.color).toBe('var(--text-streak)');
  });

  it('un temps fort quand la série grandit ; rien au premier affichage', () => {
    vi.useFakeTimers();
    const { fixture, element } = render({ combo: 2 });
    const chip = () => element.querySelector<HTMLElement>('[data-testid="run-combo"]');
    const set = (combo: number | null) => {
      fixture.componentRef.setInput('combo', combo);
      fixture.detectChanges();
      vi.advanceTimersByTime(1400);
      TestBed.tick();
    };
    TestBed.tick();
    expect(gsap.getTweensOf(chip()!)).toHaveLength(0);

    set(3);
    expect(gsap.getTweensOf(chip()!).length).toBeGreaterThan(0);
    gsap.killTweensOf(chip()!);
    vi.useRealTimers();
  });

  it('le total suit le score du run', async () => {
    const { fixture, element } = render({ total: 100 });
    (window as { __disableAnimations?: boolean }).__disableAnimations = true;
    try {
      fixture.componentRef.setInput('total', 233);
      fixture.detectChanges();
      await fixture.whenStable();

      expect(element.querySelector('[data-testid="run-total-score"]')?.textContent).toBe('233');
    } finally {
      delete (window as { __disableAnimations?: boolean }).__disableAnimations;
    }
  });
});
