import { onTestFinished } from 'vitest';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ModalComponent } from './modal.component';

@Component({
  imports: [ModalComponent],
  template: `
    <button id="opener" type="button">Ouvrir</button>
    @if (open()) {
      <app-modal closeLabel="Fermer" (closed)="closedCount = closedCount + 1">
        <p>Contenu</p>
      </app-modal>
    }
  `,
})
class HostComponent {
  readonly open = signal(false);
  closedCount = 0;
}

describe('ModalComponent', () => {
  function setup() {
    const fixture = TestBed.createComponent(HostComponent);
    // Attaché au document : le focus n'existe que pour des éléments affichés.
    document.body.appendChild(fixture.nativeElement);
    onTestFinished(() => fixture.nativeElement.remove());
    fixture.detectChanges();
    const opener = fixture.nativeElement.querySelector('#opener') as HTMLButtonElement;
    opener.focus();
    fixture.componentInstance.open.set(true);
    fixture.detectChanges();
    TestBed.tick();
    return { fixture, host: fixture.componentInstance, el: fixture.nativeElement as HTMLElement, opener };
  }

  it('affiche le contenu projeté dans une fenêtre <dialog>', () => {
    const { el } = setup();
    expect(el.querySelector('dialog')?.textContent).toContain('Contenu');
  });

  it('Échap demande la fermeture', () => {
    const { host } = setup();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(host.closedCount).toBe(1);
  });

  it('un clic sur le fond demande la fermeture', () => {
    const { host, el } = setup();
    (el.querySelector('button[aria-label="Fermer"]') as HTMLButtonElement).click();
    expect(host.closedCount).toBe(1);
  });

  it('déplace le focus dans la fenêtre à l\'ouverture et le rend à la fermeture', () => {
    const { fixture, el, opener } = setup();
    expect(el.querySelector('dialog')?.contains(document.activeElement)).toBe(true);

    fixture.componentInstance.open.set(false);
    fixture.detectChanges();
    expect(document.activeElement).toBe(opener);
  });
});
