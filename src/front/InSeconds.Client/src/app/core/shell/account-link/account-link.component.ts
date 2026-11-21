import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { SessionStore } from '../../session/session.store';

/**
 * Le cadenas de l'admin, à droite du titre IN//SECONDS (compte admin seulement) : un rond gris à contour neutre, sans fond ni lueur. Le compte
 * (« Profil », « Connexion » pour un invité) est dans la barre du bas. Rien tant que l'identité n'est pas lue.
 */
@Component({
  selector: 'app-account-link',
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (session.loaded() && session.isLinked() && session.isAdmin()) {
      <a routerLink="/admin" class="header-round" data-testid="header-admin"
         [attr.title]="'shell.header.admin' | translate" [attr.aria-label]="'shell.header.admin' | translate">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"
             stroke-linejoin="round" aria-hidden="true" style="display:block">
          <rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>
        </svg>
      </a>
    }
  `,
  styles: `
    :host { display: contents; }
    .header-round {
      display: flex; align-items: center; justify-content: center; width: 2.5rem; height: 2.5rem; flex-shrink: 0;
      border-radius: 9999px; border: 1px solid var(--border-neutral); color: var(--text-light); text-decoration: none;
    }
    .header-round:focus-visible { outline: 2px solid var(--color-accent-3); outline-offset: 2px; }
  `,
})
export class AccountLinkComponent {
  protected readonly session = inject(SessionStore);
}
