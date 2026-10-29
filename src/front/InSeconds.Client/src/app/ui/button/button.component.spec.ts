import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ButtonComponent } from './button.component';

@Component({
  imports: [ButtonComponent],
  template: `
    <button appButton type="button" id="primary">Jouer</button>
    <button appButton type="button" id="danger" variant="danger" size="sm" [block]="true" disabled>Abandonner</button>
    <button appButton type="button" id="start" size="lg" [glow]="true">Commencer</button>
    <a appButton id="skip" variant="neutral">Passer</a>
  `,
})
class HostComponent {}

describe('ButtonComponent', () => {
  function render(): HTMLElement {
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('reste un vrai <button> avec son contenu', () => {
    const button = render().querySelector<HTMLButtonElement>('#primary')!;

    expect(button.tagName).toBe('BUTTON');
    expect(button.textContent).toContain('Jouer');
    expect(button.classList).toContain('app-button--primary');
  });

  it('applique variante, taille, pleine largeur et garde disabled natif', () => {
    const button = render().querySelector<HTMLButtonElement>('#danger')!;

    expect([...button.classList]).toEqual(
      expect.arrayContaining(['app-button', 'app-button--danger', 'app-button--sm', 'app-button--block']),
    );
    expect(button.classList).not.toContain('app-button--primary');
    expect(button.disabled).toBe(true);
  });

  it('taille lg et lueur permanente sur demande, jamais par défaut', () => {
    const root = render();

    expect([...root.querySelector('#start')!.classList]).toEqual(expect.arrayContaining(['app-button--lg', 'app-button--glow']));
    expect(root.querySelector('#primary')!.classList).not.toContain('app-button--glow');
  });

  it('variante neutre, aussi sur un lien', () => {
    const link = render().querySelector<HTMLAnchorElement>('#skip')!;

    expect(link.tagName).toBe('A');
    expect(link.classList).toContain('app-button--neutral');
    expect(link.classList).not.toContain('app-button--primary');
  });
});
