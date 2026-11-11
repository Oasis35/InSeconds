import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { themeIconByName } from './theme-icon';

/**
 * L'icône d'un thème (Lucide, trait de la couleur du texte). Un nom absent du stock n'affiche rien. Le contenu vient du fichier du stock,
 * écrit par nous : il est donc déclaré sûr, jamais lu d'ailleurs.
 */
@Component({
  selector: 'app-theme-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'inline-flex shrink-0', '[class.hidden]': '!markup()', 'aria-hidden': 'true' },
  template: `@if (markup(); as svg) {
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
      stroke-linejoin="round" [attr.width]="size()" [attr.height]="size()" [innerHTML]="svg"></svg>
  }`,
})
export class ThemeIconComponent {
  private readonly sanitizer = inject(DomSanitizer);

  /** Le nom Lucide gardé par l'API. */
  readonly name = input<string | null | undefined>(null);
  /** Le côté, en pixels. */
  readonly size = input(20);

  protected readonly markup = computed<SafeHtml | null>(() => {
    const icon = themeIconByName(this.name());
    return icon ? this.sanitizer.bypassSecurityTrustHtml(icon.svg) : null;
  });
}
