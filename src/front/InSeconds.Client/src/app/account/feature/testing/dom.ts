import { ComponentFixture } from '@angular/core/testing';

/** Écrit dans un champ comme le ferait le joueur (les Signal Forms écoutent l'événement `input`). */
export function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * Laisse passer les promesses en attente (appels API simulés) puis rafraîchit l'écran. Un tour de
 * boucle d'événements entre les deux : `whenStable` n'attend pas les micro-tâches des stores.
 */
export async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
  await fixture.whenStable();
  await new Promise<void>(resolve => setTimeout(resolve, 0));
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
}

export function query<T extends Element = HTMLElement>(fixture: ComponentFixture<unknown>, selector: string): T | null {
  return (fixture.nativeElement as HTMLElement).querySelector<T>(selector);
}

export function text(fixture: ComponentFixture<unknown>): string {
  return ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ').trim();
}
