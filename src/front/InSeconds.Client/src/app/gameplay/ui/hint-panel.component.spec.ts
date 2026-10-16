import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { HintPanelComponent } from './hint-panel.component';

describe('HintPanelComponent', () => {
  function render(inputs: Record<string, unknown> = {}) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(HintPanelComponent);
    for (const [name, value] of Object.entries(inputs)) fixture.componentRef.setInput(name, value);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, component: fixture.componentInstance, element, buttons: () => Array.from(element.querySelectorAll('button')) };
  }

  it('ne montre rien tant qu\'aucun indice n\'est débloqué ni révélé', () => {
    expect(render().element.textContent?.trim()).toBe('');
  });

  it('un bouton par niveau proposé : leur nombre vient des réglages, pas du front', () => {
    expect(render({ levels: [1] }).buttons()).toHaveLength(1);
    TestBed.resetTestingModule();
    expect(render({ levels: [1, 2, 3] }).buttons()).toHaveLength(3);
  });

  it('demande le niveau cliqué', () => {
    const { component, buttons } = render({ levels: [1, 2] });
    const requested = vi.fn();
    component.request.subscribe(requested);
    buttons()[1].click();
    expect(requested).toHaveBeenCalledWith(2);
  });

  it('nomme le bouton d\'après ce que révèle le niveau, sinon par son numéro', () => {
    const labels = render({ levels: [1, 2, 3], kinds: ['year', 'artistMasked'] }).buttons().map(b => b.textContent!.trim());
    expect(labels).toEqual(['gameplay.hint.ask.year', 'gameplay.hint.ask.artist', 'gameplay.hint.button']);
  });

  it('prévient que chaque indice coûte des points', () => {
    expect(render({ levels: [1] }).element.textContent).toContain('gameplay.hint.costWarning');
  });

  it('les boutons attendent la réponse du back', () => {
    expect(render({ levels: [1, 2], pending: true }).buttons().every(button => button.disabled)).toBe(true);
  });

  it('affiche ce que le back a révélé, avec l\'étiquette de son type', () => {
    const { element } = render({
      hints: [{ kind: 'year', value: '2013' }, { kind: 'artistMasked', value: 'D _ _ _   P _ _ _' }, { kind: 'decade', value: '10s' }],
    });
    const text = element.textContent!;
    expect(text).toContain('gameplay.hint.kind.year');
    expect(text).toContain('2013');
    expect(text).toContain('gameplay.hint.kind.artist');
    expect(text).toContain('D _ _ _   P _ _ _');
    expect(text).toContain('gameplay.hint.kind.other');
  });

  it('un indice révélé et un niveau encore disponible s\'affichent ensemble', () => {
    const { element, buttons } = render({ hints: [{ kind: 'year', value: '2013' }], levels: [2] });
    expect(element.textContent).toContain('2013');
    expect(buttons()).toHaveLength(1);
  });
});
