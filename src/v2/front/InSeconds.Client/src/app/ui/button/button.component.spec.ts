import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ButtonComponent } from './button.component';

@Component({
  imports: [ButtonComponent],
  template: `
    <button appButton type="button" id="primary">Jouer</button>
    <button appButton type="button" id="danger" variant="danger" size="sm" [block]="true" disabled>Abandonner</button>
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
});
