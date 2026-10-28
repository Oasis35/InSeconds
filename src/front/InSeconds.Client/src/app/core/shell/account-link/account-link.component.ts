import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { SessionStore } from '../../session/session.store';

/**
 * Les accès de l'en-tête, à droite du titre IN//SECONDS : le calendrier des jours passés, le cadenas de l'admin (compte admin seulement),
 * puis l'initiale du compte connecté (mène au profil), ou « Connexion » en toutes lettres pour un invité ou un visiteur. Des ronds gris,
 * sans dégradé ni lueur. Ni compte ni cadenas tant que l'identité n'est pas lue.
 */
@Component({
  selector: 'app-account-link',
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (showArchive()) {
      <a routerLink="/daily/archive" class="header-round" data-testid="header-archive"
         [attr.title]="'shell.header.archive' | translate" [attr.aria-label]="'shell.header.archive' | translate">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
             stroke-linejoin="round" aria-hidden="true" style="display:block">
          <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
        </svg>
      </a>
    }
    @if (!session.loaded()) {
      <!-- Identité pas encore lue : ni initiale ni « Connexion » (sinon un compte connecté voit un instant le lien). -->
    } @else if (session.isLinked()) {
      @if (session.isAdmin()) {
        <a routerLink="/admin" class="header-round" data-testid="header-admin"
           [attr.title]="'shell.header.admin' | translate" [attr.aria-label]="'shell.header.admin' | translate">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
               stroke-linejoin="round" aria-hidden="true" style="display:block">
            <rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>
          </svg>
        </a>
      }
      <a routerLink="/account/profile" class="header-round header-initial"
         [attr.title]="'shell.header.avatarTitle' | translate: { pseudo: pseudo() }" [attr.aria-label]="'shell.header.profile' | translate">
        {{ initial() }}
      </a>
    } @else {
      <a routerLink="/account/login" class="header-login" data-testid="header-login">{{ 'shell.header.login' | translate }}</a>
    }
  `,
  styles: `
    :host { display: contents; }
    .header-round {
      display: flex; align-items: center; justify-content: center; width: 2.5rem; height: 2.5rem; flex-shrink: 0;
      border-radius: 9999px; border: 1px solid var(--border-neutral); color: var(--text-light); text-decoration: none;
    }
    .header-initial { font-family: var(--font-display); font-size: 0.875rem; font-weight: 700; text-transform: uppercase; }
    .header-login {
      display: flex; align-items: center; min-height: 2.75rem; padding-left: 0.25rem; white-space: nowrap;
      font-size: 0.875rem; color: var(--text-light); text-decoration: none;
    }
    .header-round:focus-visible, .header-login:focus-visible { outline: 2px solid var(--color-accent-2); outline-offset: 2px; }
  `,
})
export class AccountLinkComponent {
  protected readonly session = inject(SessionStore);

  /** Le calendrier des jours passés (masqué sur la page des jours passés, qui a déjà le sien). */
  readonly showArchive = input(true);

  protected readonly pseudo = computed(() => this.session.player()?.pseudo ?? '');
  protected readonly initial = computed(() => [...this.pseudo()][0] ?? '?');
}
