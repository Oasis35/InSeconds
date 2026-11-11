import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, input, viewChild } from '@angular/core';
import { themeIconByName } from './theme-icon';

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * L'icône d'un thème (Lucide, trait de la couleur du texte). Un nom absent du stock n'affiche rien. Le dessin vient du fichier du stock, écrit par
 * nous : il est lu comme un document SVG puis ses éléments sont copiés dans le `<svg>`, sans jamais passer par `innerHTML` ni désactiver l'assainissement.
 */
@Component({
  selector: 'app-theme-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0', '[class.hidden]': '!svg()', 'aria-hidden': 'true' },
  template: `@if (svg()) {
    <svg #canvas xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
      stroke-linejoin="round" [attr.width]="size()" [attr.height]="size()"></svg>
  }`,
})
export class ThemeIconComponent {
  /** Le nom Lucide gardé par l'API. */
  readonly name = input<string | null | undefined>(null);
  /** Le côté, en pixels. */
  readonly size = input(20);

  protected readonly svg = computed(() => themeIconByName(this.name())?.svg ?? null);
  private readonly canvas = viewChild<ElementRef<SVGSVGElement>>('canvas');

  constructor() {
    effect(() => {
      const target = this.canvas()?.nativeElement;
      const markup = this.svg();
      if (!target || !markup) return;
      const doc = new DOMParser().parseFromString(`<svg xmlns="${SVG_NS}">${markup}</svg>`, 'image/svg+xml');
      target.replaceChildren(...Array.from(doc.documentElement.children, child => document.importNode(child, true)));
    });
  }
}
