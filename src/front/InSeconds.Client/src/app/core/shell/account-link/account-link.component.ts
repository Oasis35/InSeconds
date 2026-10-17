import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { SessionStore } from '../../session/session.store';

/**
 * Le lien de compte, dans le bandeau IN//SECONDS du jeu du jour (seul endroit de l'app où il apparaît) : l'avatar du compte connecté
 * (initiale du pseudo, mène au profil), ou une silhouette libellée « Se connecter » qui mène à la connexion pour un invité ou un visiteur,
 * rien tant que l'identité n'est pas lue.
 */
@Component({
  selector: 'app-account-link',
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!session.loaded()) {
      <!-- Identité pas encore lue : ni avatar ni « Se connecter » (sinon un compte connecté voit un instant le lien). -->
    } @else if (session.isLinked()) {
      <a routerLink="/account/profile" class="app-avatar"
         [attr.title]="'shell.header.avatarTitle' | translate: { pseudo: pseudo() }" [attr.aria-label]="'shell.header.profile' | translate">
        {{ initial() }}
      </a>
    } @else {
      <!-- Le texte « Se connecter » ne tient pas à côté du titre sur un petit écran : une silhouette, libellée. -->
      <a routerLink="/account/login" class="app-avatar app-avatar--guest"
         [attr.title]="'shell.header.login' | translate" [attr.aria-label]="'shell.header.login' | translate">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
             stroke-linejoin="round" aria-hidden="true" style="display:block">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
      </a>
    }
  `,
  styles: `
    :host { display: contents; }
    .app-avatar {
      display: flex; align-items: center; justify-content: center; width: 2rem; height: 2rem;
      border-radius: 9999px; font-family: var(--font-display); font-size: 0.875rem; font-weight: 700; text-transform: uppercase;
      color: var(--text-on-primary); background: var(--gradient-primary); box-shadow: var(--glow-primary);
      text-decoration: none;
    }
    .app-avatar--guest { color: var(--text-muted); background: transparent; box-shadow: none; border: 1px solid var(--border-medium); }
    .app-avatar:focus-visible { outline: 2px solid var(--color-accent-2); outline-offset: 2px; }
  `,
})
export class AccountLinkComponent {
  protected readonly session = inject(SessionStore);

  protected readonly pseudo = computed(() => this.session.player()?.pseudo ?? '');
  protected readonly initial = computed(() => [...this.pseudo()][0] ?? '?');
}
