import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { RunPseudoScreenComponent } from './run-pseudo-screen.component';

@Component({
  imports: [RunPseudoScreenComponent],
  template: `<app-run-pseudo-screen [initial]="initial()" [busy]="busy()" [error]="error()" (save)="saved.push($event)" (dismiss)="cancelled = cancelled + 1" />`,
})
class HostComponent {
  initial = signal('');
  busy = signal(false);
  error = signal<string | null>(null);
  saved: string[] = [];
  cancelled = 0;
}

describe('RunPseudoScreenComponent', () => {
  function setup(): { host: HostComponent; el: HTMLElement; detect: () => void } {
    TestBed.configureTestingModule({ providers: [provideTranslateService(), provideRouter([])] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    return { host: fixture.componentInstance, el: fixture.nativeElement, detect: () => fixture.detectChanges() };
  }
  const q = (el: HTMLElement, id: string): HTMLElement | null => el.querySelector(`[data-testid="${id}"]`);

  it('la première fois : pas de « Annuler », la saisie part au clic sur le bouton', () => {
    const { host, el } = setup();
    const input = q(el, 'run-pseudo-input') as HTMLInputElement;
    input.value = 'Léa';
    input.dispatchEvent(new Event('input'));

    (q(el, 'run-pseudo') as HTMLFormElement).dispatchEvent(new Event('submit'));

    expect(q(el, 'run-pseudo-cancel')).toBeNull();
    expect(host.saved).toEqual(['Léa']);
  });

  it('en modification : le pseudo actuel est prérempli et « Annuler » est là', () => {
    const { host, el, detect } = setup();
    host.initial.set('Léa');
    detect();

    expect((q(el, 'run-pseudo-input') as HTMLInputElement).value).toBe('Léa');
    (q(el, 'run-pseudo-cancel') as HTMLButtonElement).click();
    expect(host.cancelled).toBe(1);
  });

  it('affiche le refus et ne renvoie rien pendant un envoi', () => {
    const { host, el, detect } = setup();
    host.error.set('runs.pseudo.taken');
    host.busy.set(true);
    detect();

    expect(q(el, 'run-pseudo-error')).not.toBeNull();
    (q(el, 'run-pseudo') as HTMLFormElement).dispatchEvent(new Event('submit'));
    expect(host.saved).toEqual([]);
  });
});
