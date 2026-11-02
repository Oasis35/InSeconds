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

  const twoFrames = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

  const layer = (element: HTMLElement, name: string) => element.querySelector<HTMLElement>(`[data-testid="waveform-${name}"]`)!;
  const bars = (element: HTMLElement) => Array.from(layer(element, 'played').querySelectorAll<HTMLElement>('span'));
  /** La part découverte d'une couche, lue sur sa translation (au pixel près une fois la largeur mesurée, en % avant). */
  const shown = (element: HTMLElement, name: string) => {
    const [, value, unit] = /translateX\((-?[\d.]+)(px|%)\)/.exec(layer(element, name).style.transform)!;
    const width = unit === '%' ? 100 : element.querySelector<HTMLElement>('[data-testid="waveform"]')!.clientWidth;
    return 1 + Number(value) / width;
  };

  it('dessine la waveform : 60 barres plates tant que la forme n\'est pas là, puis la vraie forme dans les couches révélées', () => {
    const { fixture, element } = render({ phase: 'listened' });
    expect(bars(element)).toHaveLength(60);
    expect(element.querySelectorAll('[data-testid="waveform"] span')).toHaveLength(300);
    expect(new Set(bars(element).map(bar => bar.style.height))).toEqual(new Set(['14%']));

    fixture.componentRef.setInput('peaks', [0.25, 1, 0.5, 0.75]);
    fixture.detectChanges();
    expect(bars(element).map(bar => bar.style.height)).toEqual(['25%', '100%', '50%', '75%']);
  });

  it('la forme n\'apparaît qu\'au balayage : ce qui n\'est pas joué reste plat, même une fois la forme calculée', () => {
    const { element } = render({ phase: 'listened', peaks: [0.25, 1, 0.5, 0.75] });
    const heightsOf = (name: string) => Array.from(layer(element, name).querySelectorAll<HTMLElement>('span')).map(bar => bar.style.height);
    expect(new Set(heightsOf('unlocked'))).toEqual(new Set(['14%']));
    const flatBase = Array.from(element.querySelectorAll<HTMLElement>('[data-testid="waveform"] > div:first-child span'));
    expect(new Set(flatBase.map(bar => bar.style.height))).toEqual(new Set(['14%']));
    for (const name of ['seen', 'played', 'trail']) expect(heightsOf(name)).toEqual(['25%', '100%', '50%', '75%']);
  });

  it('garde révélé le plus loin déjà écouté quand une écoute repart de 0', async () => {
    const { fixture, element } = render({ phase: 'listened', chosenSeconds: 2 });
    fixture.componentRef.setInput('chosenSeconds', 3);
    fixture.componentRef.setInput('phase', 'playing');
    fixture.componentRef.setInput('position', 0.5);
    fixture.detectChanges();
    await twoFrames();
    expect(shown(element, 'played')).toBeLessThan(0.1);
    expect(shown(element, 'seen')).toBeCloseTo(0.2, 2);
    expect(shown(element, 'unlocked')).toBeCloseTo(0.3, 2);
  });

  it('la traîne suit la tête de lecture, ses barres posées exactement sur celles de la couche jouée', async () => {
    const { fixture, element } = render({ phase: 'listened', chosenSeconds: 5 });
    element.style.display = 'block';
    element.style.width = '300.4px';
    await twoFrames();
    fixture.detectChanges();
    expect(shown(element, 'trail')).toBeCloseTo(0.5, 2);
    const lefts = (name: string) => Array.from(layer(element, name).querySelectorAll('span')).slice(25, 30).map(bar => bar.getBoundingClientRect().left);
    lefts('trail').forEach((left, i) => expect(left).toBeCloseTo(lefts('played')[i], 1));
  });

  it('un extrait qui recharge repart d\'une forme plate', () => {
    const { fixture, element } = render({ phase: 'listened', chosenSeconds: 2 });
    expect(shown(element, 'seen')).toBeCloseTo(0.2, 2);
    fixture.componentRef.setInput('chosenSeconds', 0.5);
    fixture.componentRef.setInput('phase', 'loading');
    fixture.detectChanges();
    expect(shown(element, 'seen')).toBe(0);
  });

  it('découvre le cyan pâle jusqu\'au palier débloqué et le cyan vif jusqu\'au palier joué, sur l\'échelle du dernier palier', () => {
    const { element } = render({ phase: 'listened', chosenSeconds: 5 });
    expect(shown(element, 'unlocked')).toBeCloseTo(0.5);
    expect(shown(element, 'played')).toBeCloseTo(0.5);
    // Les barres de la couche restent en place : sa translation est compensée par celle de son contenu.
    const inner = layer(element, 'played').firstElementChild as HTMLElement;
    expect(inner.style.transform).toBe(layer(element, 'played').style.transform.replace('-', ''));
  });

  it('rien de joué pendant le chargement, le palier débloqué déjà en cyan pâle', () => {
    const { element } = render({ phase: 'loading', chosenSeconds: 1 });
    expect(shown(element, 'played')).toBe(0);
    expect(shown(element, 'unlocked')).toBeCloseTo(0.1);
  });

  it('une fois la largeur mesurée, translations au pixel près (jamais de barre cyan posée à une fraction de pixel des grises)', async () => {
    const { fixture, element } = render({ phase: 'listened', chosenSeconds: 1.5 });
    element.style.display = 'block';
    element.style.width = '263px';
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    fixture.detectChanges();
    for (const name of ['played', 'unlocked']) {
      expect(layer(element, name).style.transform).toMatch(/^translateX\(-\d+px\)$/);
      expect((layer(element, name).firstElementChild as HTMLElement).style.transform).toMatch(/^translateX\(\d+px\)$/);
    }
    expect(shown(element, 'played')).toBeCloseTo(0.15, 1);
  });

  it('pendant la lecture, la couche vive suit la position, à chaque image', async () => {
    const { fixture, element } = render({ chosenSeconds: 5, position: 2 });
    expect(shown(element, 'played')).toBeCloseTo(0.2);
    fixture.componentRef.setInput('position', 4);
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    expect(shown(element, 'played')).toBeGreaterThanOrEqual(0.4);
    expect(shown(element, 'played')).toBeLessThanOrEqual(0.5);
    // La position passe au chrono lu par les lecteurs d'écran, au dixième.
    fixture.componentRef.setInput('position', 4.04);
    fixture.detectChanges();
    expect(timer(element)).toBe('4,0 s / 5 s');
  });

  it('la boucle d\'image s\'arrête avec la lecture : la couche vive reste au palier joué', async () => {
    const { fixture, element } = render({ chosenSeconds: 5, position: 2 });
    fixture.componentRef.setInput('phase', 'listened');
    fixture.detectChanges();
    await twoFrames();
    expect(shown(element, 'played')).toBeCloseTo(0.5, 2);
    fixture.componentRef.setInput('position', 1);
    await twoFrames();
    expect(shown(element, 'played')).toBeCloseTo(0.5, 2);
  });

  it('la boucle d\'image s\'arrête quand le lecteur disparaît', () => {
    const cancel = vi.spyOn(globalThis, 'cancelAnimationFrame');
    const { fixture } = render({ chosenSeconds: 5, position: 2 });
    fixture.destroy();
    expect(cancel).toHaveBeenCalled();
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

describe('RoundPlayerComponent en mouvement réduit', () => {
  const flags = globalThis.window as { __disableAnimations?: boolean };
  beforeEach(() => (flags.__disableAnimations = true));
  afterEach(() => delete flags.__disableAnimations);

  it('pas de transition sur le cyan pâle, et la couche vive suit la position au dixième, sans anticiper', async () => {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(RoundPlayerComponent);
    for (const [name, value] of Object.entries({ phase: 'playing', chosenSeconds: 10, steps: [0.5, 1, 2, 5, 10], position: 2.04 })) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(element.querySelector('.wave-sweep')).toBeNull();
    const played = element.querySelector<HTMLElement>('[data-testid="waveform-played"]')!;
    const width = element.querySelector<HTMLElement>('[data-testid="waveform"]')!.clientWidth;
    await new Promise(resolve => setTimeout(resolve, 50));
    const before = played.style.transform;
    await new Promise(resolve => setTimeout(resolve, 120));
    // Rien ne bouge tant que la position ne change pas : pas de lissage en mouvement réduit.
    expect(played.style.transform).toBe(before);
    expect(before).toBe(`translateX(${Math.round(0.2 * width) - width}px)`);
  });
});
