import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { AnswerSuggestion } from '../domain/answer';
import { AnswerInputComponent } from './answer-input.component';

const DAFT: AnswerSuggestion = { artist: 'Daft Punk', title: 'Get Lucky' };
const MUSE: AnswerSuggestion = { artist: 'Muse', title: 'Uprising' };

describe('AnswerInputComponent', () => {
  function render(inputs: Record<string, unknown> = {}) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(AnswerInputComponent);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const input = element.querySelector('input')!;
    const press = (key: string) => {
      const event = new KeyboardEvent('keydown', { key, cancelable: true, bubbles: true });
      input.dispatchEvent(event);
      return event;
    };
    return { fixture, component: fixture.componentInstance, element, input, press };
  }

  it('annonce la saisie', () => {
    const { component, input } = render();
    const changed = vi.fn();
    component.queryChange.subscribe(changed);

    input.value = 'daft';
    input.dispatchEvent(new Event('input'));

    expect(changed).toHaveBeenCalledWith('daft');
  });

  describe('bouton ✕', () => {
    it('n\'existe que si le champ contient du texte', () => {
      expect(render().element.querySelector('button')).toBeNull();
      TestBed.resetTestingModule();
      expect(render({ query: 'daft' }).element.querySelector('button')?.textContent).toBe('✕');
    });

    it('efface sans faire perdre le focus au champ (mousedown)', () => {
      const { component, element } = render({ query: 'daft' });
      const cleared = vi.fn();
      component.clear.subscribe(cleared);
      const event = new MouseEvent('mousedown', { cancelable: true, bubbles: true });

      element.querySelector('button')!.dispatchEvent(event);

      expect(cleared).toHaveBeenCalledOnce();
      expect(event.defaultPrevented).toBe(true);
    });
  });

  describe('propositions', () => {
    it('les montre « artiste — titre », la surbrillance marquée', () => {
      const { element } = render({ suggestions: [DAFT, MUSE], highlighted: 1 });
      const items = element.querySelectorAll('li');

      expect(items).toHaveLength(2);
      expect(items[0].textContent).toContain('Daft Punk');
      expect(items[0].textContent).toContain('Get Lucky');
      expect(items[1].getAttribute('aria-selected')).toBe('true');
      expect(items[0].getAttribute('aria-selected')).toBe('false');
    });

    it('un clic choisit sans faire perdre le focus (avant le blur qui ferme la liste)', () => {
      const { component, element } = render({ suggestions: [DAFT, MUSE] });
      const picked = vi.fn();
      component.pick.subscribe(picked);
      const event = new MouseEvent('mousedown', { cancelable: true, bubbles: true });

      element.querySelectorAll('li')[1].dispatchEvent(event);

      expect(picked).toHaveBeenCalledWith(MUSE);
      expect(event.defaultPrevented).toBe(true);
    });

    it('le survol annonce la proposition', () => {
      const { component, element } = render({ suggestions: [DAFT, MUSE] });
      const hovered = vi.fn();
      component.highlight.subscribe(hovered);
      element.querySelectorAll('li')[1].dispatchEvent(new MouseEvent('mouseenter'));
      expect(hovered).toHaveBeenCalledWith(1);
    });

    it('pas de liste sans proposition', () => {
      expect(render().element.querySelector('ul')).toBeNull();
    });
  });

  describe('clavier', () => {
    it('↓ et ↑ déplacent la surbrillance, sans bouger le curseur du champ', () => {
      const { component, press } = render({ suggestions: [DAFT, MUSE] });
      const moved = vi.fn();
      component.move.subscribe(moved);

      expect(press('ArrowDown').defaultPrevented).toBe(true);
      expect(press('ArrowUp').defaultPrevented).toBe(true);

      expect(moved.mock.calls).toEqual([[1], [-1]]);
    });

    it('Entrée choisit la proposition en surbrillance, sans valider le formulaire', () => {
      const { component, press } = render({ suggestions: [DAFT, MUSE], highlighted: 0 });
      // Le parent décide : il peut empêcher la validation du formulaire dans le gestionnaire (appel synchrone).
      component.enter.subscribe(event => event.preventDefault());

      expect(press('Enter').defaultPrevented).toBe(true);
    });

    it('Entrée sans surbrillance laisse le formulaire se valider', () => {
      const { component, press } = render({ suggestions: [DAFT, MUSE], highlighted: -1 });
      const entered = vi.fn();
      component.enter.subscribe(entered);

      // Le composant ne bloque rien lui-même : sans choix du parent, le formulaire se valide.
      expect(press('Enter').defaultPrevented).toBe(false);
      expect(entered).toHaveBeenCalledOnce();
    });

    it('Échap ferme la liste', () => {
      const { component, press } = render({ suggestions: [DAFT] });
      const dismissed = vi.fn();
      component.dismiss.subscribe(dismissed);
      press('Escape');
      expect(dismissed).toHaveBeenCalledOnce();
    });

    it('sans proposition, les touches ne font rien (Entrée valide le formulaire)', () => {
      const { component, press } = render();
      const moved = vi.fn();
      component.move.subscribe(moved);

      expect(press('ArrowDown').defaultPrevented).toBe(false);
      expect(press('Enter').defaultPrevented).toBe(false);
      expect(moved).not.toHaveBeenCalled();
    });
  });

  it('annonce le focus et la sortie du champ', () => {
    const { component, input } = render();
    const focused = vi.fn(), blurred = vi.fn();
    component.focused.subscribe(focused);
    component.blurred.subscribe(blurred);
    input.dispatchEvent(new Event('focus'));
    input.dispatchEvent(new Event('blur'));
    expect(focused).toHaveBeenCalledOnce();
    expect(blurred).toHaveBeenCalledOnce();
  });
});
