import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { BrowserIdComponent } from '../../account/feature/browser-id.component';
import { ProfileStore } from '../../account/data-access/profile.store';
import { SessionStore } from '../../core/session/session.store';
import { DecorBackgroundComponent } from '../../ui/decor-background/decor-background.component';

/**
 * Coquille de l'admin (`/admin/**`) : l'accès, puis les onglets. L'admin n'est pas un mécanisme
 * séparé : c'est un rôle sur le compte du joueur (le même cookie, la même connexion par lien
 * magique). Trois états, que l'API revérifie de toute façon à chaque requête :
 * - pas de compte connecté : invitation à se connecter ;
 * - compte sans le rôle : accès refusé ;
 * - admin : les onglets et la déconnexion.
 * L'identifiant du navigateur est affiché dans tous les cas (repérer ses propres parties).
 */
@Component({
  selector: 'app-admin-shell-page',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe, BrowserIdComponent, DecorBackgroundComponent],
  providers: [ProfileStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main class="da-bg relative min-h-dvh flex flex-col items-center gap-6 px-4 pt-20 pb-10">
      <app-decor-background />
      <div class="relative w-full flex flex-col items-center gap-6">
      <div class="w-full max-w-2xl flex flex-col gap-2">
        <h1 class="text-xl font-bold" style="color:var(--text-hi)">{{ 'admin.title' | translate }}</h1>
        <app-browser-id />
      </div>

      @if (session.loaded()) {
        @if (!session.isLinked()) {
          <section class="w-full max-w-2xl flex flex-col gap-3" data-testid="admin-gate">
            <h2 class="text-lg font-semibold" style="color:var(--text-hi)">{{ 'admin.notLoggedIn' | translate }}</h2>
            <p class="text-sm" style="color:var(--text-muted)">{{ 'admin.notLoggedInBody' | translate }}</p>
            <a routerLink="/account/login" class="text-sm underline" style="color:var(--text-indigo)">{{ 'admin.goToLogin' | translate }}</a>
          </section>
        } @else if (!session.isAdmin()) {
          <section class="w-full max-w-2xl flex flex-col gap-3" data-testid="admin-gate">
            <h2 class="text-lg font-semibold" style="color:var(--text-hi)">{{ 'admin.accessDenied' | translate }}</h2>
            <p class="text-sm" style="color:var(--text-muted)">{{ 'admin.accessDeniedBody' | translate }}</p>
            <a routerLink="/daily" class="text-sm underline" style="color:var(--text-indigo)">{{ 'admin.backToGame' | translate }}</a>
          </section>
        } @else {
          <div class="w-full max-w-2xl flex items-center justify-between gap-3">
            <nav class="flex items-center gap-1" [attr.aria-label]="'admin.title' | translate">
              <a routerLink="/admin/catalogue" routerLinkActive="is-active" ariaCurrentWhenActive="page" [replaceUrl]="true"
                class="admin-tab text-sm font-medium px-3 py-1.5 rounded-lg">{{ 'admin.tabs.poolPlain' | translate }}</a>
            </nav>
            <button type="button" (click)="profile.logout()" [disabled]="profile.logoutStatus() === 'pending'"
              class="text-xs px-3 py-1.5 rounded-lg transition-colors"
              style="color:var(--text-muted);border:1px solid var(--border-strong)">
              {{ 'admin.logout' | translate }}
            </button>
          </div>
          <router-outlet />
        }
      }
      </div>
    </main>
  `,
  styles: `
    .admin-tab { color: var(--text-muted); background: var(--bg-inactive); }
    .admin-tab.is-active { color: var(--text-on-primary); background: var(--bg-primary-dk); }
  `,
})
export class AdminShellPage {
  protected readonly session = inject(SessionStore);
  protected readonly profile = inject(ProfileStore);
}
