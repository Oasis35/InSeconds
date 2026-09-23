import { Component, input, ChangeDetectionStrategy } from '@angular/core';

export type StreakIconName = 'flame' | 'snowflake' | 'heart-crack' | 'user';

/**
 * Icônes SVG (style Lucide, stroke 2, `currentColor`) du gel de série — une seule source
 * pour les chemins, réutilisée par la gélule, le panneau, les toasts et le profil.
 * Taille relative à la police courante (1.05em), comme dans la maquette.
 */
@Component({
  selector: 'app-streak-icon',
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './streak-icon.component.html',
  host: { style: 'display:inline-flex;flex-shrink:0' },
})
export class StreakIconComponent {
  readonly name = input.required<StreakIconName>();
  readonly size = input('1.05em');
}
