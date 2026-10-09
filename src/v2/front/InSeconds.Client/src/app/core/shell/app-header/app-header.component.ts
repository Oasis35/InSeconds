import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { AccountLinkComponent } from './account-link.component';
import { HeaderSlot } from './header-slot';

/**
 * En-tête global de l'app : le lien de compte (`<app-account-link>` : avatar ou « Se connecter ») en haut à droite, posé en superposition :
 * il ne décale aucun écran. Effacé sur une page qui a son propre en-tête (`HeaderSlot` : le jeu du jour, qui pose le lien de compte dans son
 * bandeau).
 */
@Component({
  selector: 'app-header',
  imports: [AccountLinkComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!slot.takenOver()) {
      <div class="absolute inset-x-0 top-0 z-30 flex items-center justify-end gap-3 p-4">
        <app-account-link />
      </div>
    }
  `,
  styles: `:host { position: relative; display: block; height: 0; }`,
})
export class AppHeaderComponent {
  protected readonly slot = inject(HeaderSlot);
}
