import { ComponentFixture } from '@angular/core/testing';

/** Écrit dans un champ comme le ferait le joueur (les Signal Forms écoutent l'événement `input`). */
export function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/** Voir `core/testing/settle` : le même helper sert aux specs de tous les domaines. */
export { settle } from '../../../core/testing/settle';

export function query<T extends Element = HTMLElement>(fixture: ComponentFixture<unknown>, selector: string): T | null {
  return (fixture.nativeElement as HTMLElement).querySelector<T>(selector);
}

export function text(fixture: ComponentFixture<unknown>): string {
  return ((fixture.nativeElement as HTMLElement).textContent ?? '').replace(/\s+/g, ' ').trim();
}
