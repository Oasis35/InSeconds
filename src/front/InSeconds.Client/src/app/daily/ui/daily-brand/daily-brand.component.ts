import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Titre IN//SECONDS centré dans la barre arrondie floutée de l'en-tête. La page y projette à gauche `[brandLeft]` (gélule de série ou
 * score) et à droite `[brandRight]` (lien de compte). Sur une page qui a son propre titre (`h1`), le logo devient un lien vers le jeu du jour
 * (`homeLink`).
 */
@Component({
  selector: 'app-daily-brand',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './daily-brand.component.html',
  // sticky sur l'hôte : posé sur l'enfant, il resterait borné par la hauteur de l'hôte.
  host: { class: 'sticky top-2 z-10 block' },
  // Titre resserré sous 360 px de large : la gélule, le titre et l'avatar tiennent côte à côte sur un petit téléphone (320 px).
  styles: `
    .brand-title { font-size: 0.875rem; line-height: 1.25rem; letter-spacing: 0.1em; }
    @media (min-width: 360px) { .brand-title { font-size: 1rem; line-height: 1.5rem; letter-spacing: 0.14em; } }
  `,
})
export class DailyBrandComponent {
  /** Le logo est un lien vers `/daily` au lieu du titre de la page. */
  readonly homeLink = input(false);
}
