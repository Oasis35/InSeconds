import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { RoundPhase } from '../../domain/track-round';
import { RoundPlayerComponent } from './round-player.component';

describe('RoundPlayerComponent', () => {
  function render(inputs: Record<string, unknown> = {}) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(RoundPlayerComponent);
    const all: Record<string, unknown> = { phase: 'playing' as RoundPhase, chosenSeconds: 1, steps: [0.5, 1, 2, 5, 10], nextStep: 2, position: 0.4, ...inputs };
    for (const [name, value] of Object.entries(all)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const button = (match: string) => Array.from(element.querySelectorAll('button')).find(b => b.textContent?.includes(match) || b.title.includes(match));
    return { fixture, component: fixture.componentInstance, element, button };
  }

  const timer = (element: HTMLElement) => element.querySelector('[data-testid="round-timer"]')?.textContent?.replace(/\s+/g, ' ').trim();

  it('affiche le temps écouté pendant la lecture', () => {
    expect(timer(render().element)).toBe('0,4 s / 1 s');
  });

  it('affiche « … » pendant le chargement', () => {
    expect(timer(render({ phase: 'loading' }).element)).toBe('…');
  });

  it('affiche le palier entier une fois joué', () => {
    expect(timer(render({ phase: 'listened' }).element)).toBe('1 s / 1 s');
  });

  const bars = (element: HTMLElement) => Array.from(element.querySelectorAll<HTMLElement>('[data-testid="waveform"] > span'));
  const colors = (element: HTMLElement) => bars(element).map(bar => bar.style.background);

  it('dessine la waveform : barres plates tant que la forme n\'est pas là, puis la vraie forme', () => {
    const { fixture, element } = render({ phase: 'listened' });
    expect(bars(element)).toHaveLength(32);
    expect(new Set(bars(element).map(bar => bar.style.height))).toEqual(new Set(['18%']));

    fixture.componentRef.setInput('peaks', [0.25, 1, 0.5, 0.75]);
    fixture.detectChanges();
    expect(bars(element).map(bar => bar.style.height)).toEqual(['25%', '100%', '50%', '75%']);
  });

  it('colore les barres : jouées en cyan, débloquées en cyan pâle, le reste en gris, sur l\'échelle du dernier palier', () => {
    // 10 barres sur 10 s : 2,4 s jouées (2 barres), 5 s débloquées (3 de plus).
    const { element } = render({ chosenSeconds: 5, position: 2.4, peaks: Array.from({ length: 10 }, () => 0.5) });
    const [played, unlocked, locked] = [colors(element)[0], colors(element)[3], colors(element)[9]];
    expect(colors(element).filter(c => c === played)).toHaveLength(2);
    expect(colors(element).filter(c => c === unlocked)).toHaveLength(3);
    expect(colors(element).filter(c => c === locked)).toHaveLength(5);
    expect(new Set([played, unlocked, locked]).size).toBe(3);
  });

  it('place un repère par palier et n\'écrit que le palier en cours et le dernier', () => {
    const { element } = render({ phase: 'listened' });
    const marks = Array.from(element.querySelectorAll('[data-testid="step-mark"]')).map(m => m.textContent!.trim());
    expect(marks).toEqual(['', '1\u00a0s', '', '', '10\u00a0s']);
  });

  it('montre les points en jeu quand le mode en donne, rien sinon', () => {
    expect(render().element.querySelector('[data-testid="round-stake"]')).toBeNull();
    TestBed.resetTestingModule();
    const { element } = render({ stake: 850 });
    expect(element.querySelector('[data-testid="round-stake"]')?.textContent).toBe('850');
    expect(element.textContent).toContain('gameplay.round.stake');
  });

  it('« ↺ » rejoue et « ▶ Xs » prolonge', () => {
    const { component, element } = render({ phase: 'listened' });
    const replay = vi.fn(), more = vi.fn();
    component.replay.subscribe(replay);
    component.listenMore.subscribe(more);

    element.querySelectorAll('button')[0].click();
    element.querySelectorAll('button')[1].click();

    expect(replay).toHaveBeenCalledOnce();
    expect(more).toHaveBeenCalledOnce();
    expect(element.querySelectorAll('button')[1].textContent).toContain('▶ 2\u00a0s');
  });

  it('au dernier palier, plus de bouton « écouter plus »', () => {
    expect(render({ chosenSeconds: 10, nextStep: null }).element.querySelectorAll('button')).toHaveLength(1);
  });

  it('sans extrait : le message et « Passer », rien d\'autre', () => {
    const { component, element } = render({ phase: 'no-preview', steps: [] });
    const skip = vi.fn();
    component.skip.subscribe(skip);

    expect(element.textContent).toContain('gameplay.round.noPreview');
    expect(element.querySelector('[data-testid="round-timer"]')).toBeNull();
    element.querySelector('button')!.click();
    expect(skip).toHaveBeenCalledOnce();
  });

  it('après un échec de lecture : « Réessayer » et « Passer », la zone d\'écoute disparaît (piège 33)', () => {
    const { component, element, button } = render({ phase: 'audio-error' });
    const retry = vi.fn(), skip = vi.fn();
    component.retry.subscribe(retry);
    component.skip.subscribe(skip);

    expect(element.querySelector('[role="alert"]')?.textContent).toContain('gameplay.round.playbackError');
    expect(element.querySelector('[data-testid="round-timer"]')).toBeNull();
    button('gameplay.round.retry')!.click();
    button('gameplay.round.skip')!.click();
    expect(retry).toHaveBeenCalledOnce();
    expect(skip).toHaveBeenCalledOnce();
  });
});

describe('RoundPlayerComponent pendant l\'envoi de la réponse', () => {
  function render(phase: string) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(RoundPlayerComponent);
    for (const [name, value] of Object.entries({ phase, chosenSeconds: 1, steps: [0.5, 1, 2], nextStep: 2 })) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return { element, buttons: () => Array.from(element.querySelectorAll('button')) };
  }

  it('grise ↺ et « ▶ » et montre un loader', () => {
    const { element, buttons } = render('submitting');
    expect(buttons()).toHaveLength(2);
    expect(buttons().every(button => button.disabled)).toBe(true);
    expect(element.querySelector('[data-testid="round-loader"]')).not.toBeNull();
  });

  it('après un échec d\'envoi : toujours grisés, plus de loader', () => {
    const { element, buttons } = render('submit-error');
    expect(buttons().every(button => button.disabled)).toBe(true);
    expect(element.querySelector('[data-testid="round-loader"]')).toBeNull();
  });

  it('pendant l\'écoute : actifs, sans loader', () => {
    const { element, buttons } = render('listened');
    expect(buttons().some(button => button.disabled)).toBe(false);
    expect(element.querySelector('[data-testid="round-loader"]')).toBeNull();
  });
});
