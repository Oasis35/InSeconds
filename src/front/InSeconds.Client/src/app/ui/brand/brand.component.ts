import { Component, ChangeDetectionStrategy, input } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * En-tête : le titre IN//SECONDS à gauche, posé sur la grille sans fond ni flou, et à droite ce que la page projette dans `[brandRight]`
 * (les accès du compte, ou le score en pleine manche). La barre n'est pas collante : elle défile avec la page. Sur une page qui a son propre
 * titre (`h1`), le logo devient un lien vers le jeu du jour (`homeLink`).
 */
@Component({
  selector: 'app-brand',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './brand.component.html',
  host: { class: 'block' },
  // Titre resserré sous 360 px de large : le titre et les trois accès du compte tiennent côte à côte sur un petit téléphone (320 px).
  styles: `
    /* Les deux barres allumées comme un tube : cœur clair, halo serré. */
    .brand-slash { color: var(--core-orange); text-shadow: 0 0 1.5px rgb(var(--rgb-accent-3)), 0 0 6px rgb(var(--rgb-accent-3) / 0.7); }
    .brand-title { font-size: 0.875rem; line-height: 1.25rem; letter-spacing: 0.1em; }
    @media (min-width: 360px) { .brand-title { font-size: 1rem; line-height: 1.5rem; letter-spacing: 0.14em; } }
  `,
})
export class BrandComponent {
  /** Le logo est un lien vers `/daily` au lieu du titre de la page. */
  readonly homeLink = input(false);
}
