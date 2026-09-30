import { ChangeDetectionStrategy, Component, input } from '@angular/core';

export type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';
export type ButtonSize = 'md' | 'sm';

/**
 * Bouton de la DA, posé sur un vrai `<button>` ou `<a>` (le focus, le clavier et `disabled`
 * restent ceux du navigateur) : `<button appButton variant="secondary">`.
 * - `primary` : dégradé orange → terracotta, action principale de l'écran ;
 * - `secondary` : contour, action alternative ;
 * - `danger` : action destructive (abandonner, supprimer) ;
 * - `ghost` : lien discret.
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
    '[class.app-button--danger]': "variant() === 'danger'",
    '[class.app-button--ghost]': "variant() === 'ghost'",
    '[class.app-button--sm]': "size() === 'sm'",
    '[class.app-button--block]': 'block()',
  },
})
export class ButtonComponent {
  readonly variant = input<ButtonVariant>('primary');
  readonly size = input<ButtonSize>('md');
  /** Occupe toute la largeur disponible. */
  readonly block = input(false);
}
