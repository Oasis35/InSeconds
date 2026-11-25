import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { SessionStore } from '../../session/session.store';

/**
 * L'accès à l'admin dans l'en-tête, à gauche du rond Instagram (compte admin seulement) : le mot « Admin » dans un rectangle à contour
 * neutre, de la hauteur du rond, sans fond ni lueur. Le mot se lit d'un coup d'œil, là où l'ancien cadenas se confondait avec l'icône voisine ;
 * posé avant Instagram, il laisse celui-ci au même endroit que chez les joueurs. Le compte (« Profil », « Connexion » pour un invité) est
 * dans la barre du bas. Rien tant que l'identité n'est pas lue.
 */
@Component({
  selector: 'app-account-link',
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (session.loaded() && session.isLinked() && session.isAdmin()) {
      <a routerLink="/admin" class="header-admin" data-testid="header-admin">{{ 'shell.header.admin' | translate }}</a>
    }
  `,
  styles: `
    :host { display: contents; }
    .header-admin {
      display: flex; align-items: center; justify-content: center; height: 2.5rem; padding: 0 0.875rem; flex-shrink: 0;
      border-radius: var(--radius-button); border: 1px solid var(--border-neutral); color: var(--text-light);
      font-size: 0.875rem; font-weight: 500; text-decoration: none; touch-action: manipulation;
    }
    .header-admin:hover { color: var(--text-hi); }
    .header-admin:focus-visible { outline: 2px solid var(--color-accent-3); outline-offset: 2px; }
  `,
})
export class AccountLinkComponent {
  protected readonly session = inject(SessionStore);
}
