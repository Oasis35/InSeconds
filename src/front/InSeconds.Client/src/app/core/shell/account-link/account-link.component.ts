import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { SessionStore } from '../../session/session.store';
import { ShellChromeStore } from '../shell-chrome.store';

/**
 * L'accès à l'admin dans l'en-tête, à gauche du rond Instagram (compte admin seulement) : le mot « Admin » dans un rectangle à contour
 * neutre, de la hauteur du rond, sans fond ni lueur. Le mot se lit d'un coup d'œil, là où l'ancien cadenas se confondait avec l'icône voisine ;
 * posé avant Instagram, il laisse celui-ci au même endroit que chez les joueurs. Un point plein le précède une fois l'état technique lu
 * (`ShellChromeStore.adminAlerts`, posé par l'admin) : vert quand tout va bien, rouge avec le nombre d'alertes (« 9+ » au-delà) sinon, jamais de halo.
 * Le compte (« Profil », « Connexion » pour un invité) est dans la barre du bas. Rien tant que l'identité n'est pas lue.
 */
@Component({
  selector: 'app-account-link',
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (session.loaded() && session.isLinked() && session.isAdmin()) {
      <a routerLink="/admin" class="header-admin" data-testid="header-admin"
         [attr.aria-label]="alertsLabel() ? (alertsLabel()! | translate: { count: alerts() }) : null">
        @if (alerts() !== null) {
          <span class="header-admin-dot" data-testid="header-admin-dot" aria-hidden="true"
                [style.background]="alerts()! > 0 ? 'var(--color-fail)' : 'var(--color-success)'"></span>
        }
        {{ 'shell.header.admin' | translate }}
        @if (alerts()! > 0) {
          <span data-testid="header-admin-count" aria-hidden="true" style="color:var(--text-error)">{{ alerts()! > 9 ? '9+' : alerts() }}</span>
        }
      </a>
    }
  `,
  styles: `
    :host { display: contents; }
    .header-admin {
      display: flex; align-items: center; justify-content: center; gap: 0.5rem; height: 2.5rem; padding: 0 0.875rem; flex-shrink: 0;
      border-radius: var(--radius-button); border: 1px solid var(--border-neutral); color: var(--text-light);
      font-size: 0.875rem; font-weight: 500; text-decoration: none; white-space: nowrap; touch-action: manipulation;
    }
    .header-admin:hover { opacity: 0.7; }
    .header-admin:focus-visible { outline: 2px solid var(--color-accent-3); outline-offset: 2px; }
    /* Le point garde sa couleur en contraste élevé de Windows (sinon il prendrait celle du texte). */
    .header-admin-dot { width: 0.5rem; height: 0.5rem; border-radius: 9999px; flex-shrink: 0; forced-color-adjust: none; }
    /* Sur un très petit téléphone (logo + Admin + point + nombre + Instagram), le bouton se resserre plutôt que de rogner le rond Instagram. */
    @media (max-width: 359px) { .header-admin { gap: 0.375rem; padding: 0 0.625rem; } }
  `,
})
export class AccountLinkComponent {
  protected readonly session = inject(SessionStore);
  /** Le nombre d'alertes de l'admin, `null` tant qu'il n'est pas lu : pas de point. */
  protected readonly alerts = inject(ShellChromeStore).adminAlerts;
  /** Le nom accessible dit l'état que le point montre (la couleur seule ne se lit pas), en commençant par le mot visible. */
  protected readonly alertsLabel = computed(() => {
    const count = this.alerts();
    if (count === null) return null;
    return count > 0 ? 'shell.header.adminAlerts' : 'shell.header.adminOk';
  });
}
