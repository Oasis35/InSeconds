import { ChangeDetectionStrategy, Component, booleanAttribute, computed, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { SessionStore } from '../../session/session.store';

/**
 * Le lien de compte de l'en-tête : l'avatar du compte connecté (initiale du pseudo, mène au profil), ou « Se connecter » pour un invité ou un
 * visiteur, rien tant que l'identité n'est pas lue. Rendu par `<app-header>`, ou dans le bandeau d'une page qui a son propre en-tête
 * (`HeaderSlot`). `compact` : avatar réduit, et silhouette libellée « Se connecter » au lieu du texte, pour tenir dans un bandeau.
 */
@Component({
  selector: 'app-account-link',
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!session.loaded()) {
      <!-- Identité pas encore lue : ni avatar ni « Se connecter » (sinon un compte connecté voit un instant le lien). -->
    } @else if (session.isLinked()) {
      <a routerLink="/account/profile" class="app-avatar" [class.app-avatar--compact]="compact()"
         [attr.title]="pseudo()" [attr.aria-label]="'shell.header.profile' | translate">
        {{ initial() }}
      </a>
    } @else if (compact()) {
      <!-- Dans un bandeau, le texte « Se connecter » ne tient pas à côté du titre sur un petit écran : une silhouette, libellée. -->
      <a routerLink="/account/login" class="app-avatar app-avatar--compact app-avatar--guest"
         [attr.title]="'shell.header.login' | translate" [attr.aria-label]="'shell.header.login' | translate">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
             stroke-linejoin="round" aria-hidden="true" style="display:block">
          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
          <circle cx="12" cy="7" r="4"></circle>
        </svg>
      </a>
    } @else {
      <a routerLink="/account/login" class="text-sm font-semibold whitespace-nowrap" style="color:var(--text-muted)">
        {{ 'shell.header.login' | translate }}
      </a>
    }
  `,
  styles: `
    :host { display: contents; }
    .app-avatar {
      display: flex; align-items: center; justify-content: center; width: 2.5rem; height: 2.5rem;
      border-radius: 9999px; font-family: var(--font-display); font-weight: 700; text-transform: uppercase;
      color: var(--text-on-primary); background: var(--gradient-primary); box-shadow: var(--glow-primary);
      text-decoration: none;
    }
    .app-avatar--compact { width: 2rem; height: 2rem; font-size: 0.875rem; }
    .app-avatar--guest { color: var(--text-muted); background: transparent; box-shadow: none; border: 1px solid var(--border-medium); }
    .app-avatar:focus-visible { outline: 2px solid var(--color-accent-2); outline-offset: 2px; }
  `,
})
export class AccountLinkComponent {
  readonly compact = input(false, { transform: booleanAttribute });

  protected readonly session = inject(SessionStore);

  protected readonly pseudo = computed(() => this.session.player()?.pseudo ?? '');
  protected readonly initial = computed(() => [...this.pseudo()][0] ?? '?');
}
