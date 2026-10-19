import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { DecorBackgroundComponent } from '../../ui/decor-background/decor-background.component';

/**
 * Cadre des écrans d'authentification (connexion, vérification, confirmation d'email) : décor de
 * la DA, colonne centrée, titre. Le contenu de l'écran est projeté.
 */
@Component({
  selector: 'app-auth-page',
  imports: [DecorBackgroundComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="da-bg relative min-h-dvh flex flex-col items-center justify-center p-6 screen-enter">
      <app-decor-background />
      <div class="relative w-full max-w-sm py-8 text-center space-y-6">
        <h1 class="text-2xl font-bold" style="font-family:var(--font-display);color:var(--text-hi)">{{ heading() }}</h1>
        <ng-content />
      </div>
    </main>
  `,
})
export class AuthPageComponent {
  /** Titre, déjà traduit. */
  readonly heading = input.required<string>();
}
