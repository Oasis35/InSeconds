import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'neutral' | 'danger' | 'ghost';
export type ButtonSize = 'lg' | 'md' | 'sm';

/**
 * Bouton de la DA, posé sur un vrai `<button>` ou `<a>` (le focus, le clavier et `disabled`
 * restent ceux du navigateur) : `<button appButton variant="secondary">`.
 * - `primary` : dégradé orange → terracotta, action principale de l'écran ;
 * - `secondary` : fond de carte et contour, action alternative (« Annuler », « Réessayer » d'un chargement) ;
 * - `neutral` : contour neutre sans fond, action sans sens propre (« Passer », « Abandonner », « Plus tard »…) ;
 * - `danger` : action destructive (abandonner, supprimer) ;
 * - `ghost` : lien discret.
 *
 * Tailles : `lg` (60 px, le bouton principal d'un écran : Commencer, Reprendre), `md` (48 px, défaut), `sm` (compact).
 * `glow` : lueur permanente du bouton principal en cours de partie (jamais sur l'accueil ni la reprise).
 */
@Component({
  selector: 'button[appButton], a[appButton]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: '<ng-content />',
  styleUrl: './button.component.scss',
  host: {
    class: 'app-button',
    '[class.app-button--primary]': "variant() === 'primary'",
    '[class.app-button--secondary]': "variant() === 'secondary'",
    '[class.app-button--neutral]': "variant() === 'neutral'",
    '[class.app-button--danger]': "variant() === 'danger'",
    '[class.app-button--ghost]': "variant() === 'ghost'",
    '[class.app-button--sm]': "size() === 'sm'",
    '[class.app-button--lg]': "size() === 'lg'",
    '[class.app-button--block]': 'block()',
    '[class.app-button--glow]': 'glow()',
  },
})
export class ButtonComponent {
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');
  /** Occupe toute la largeur disponible. */
  readonly block = input(false);
  /** Lueur permanente (sinon seulement au survol, pour `primary`). */
  readonly glow = input(false);
}
