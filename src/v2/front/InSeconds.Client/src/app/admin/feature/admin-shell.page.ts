import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { BrowserIdComponent } from '../../account/feature/browser-id.component';
import { ProfileStore } from '../../account/data-access/profile.store';
import { SessionStore } from '../../core/session/session.store';
import { AdminCounts } from '../data-access/admin-counts';
import { DEPLOYED_AT } from '../../core/shell/deployed-at';
import { ADMIN_TABS, AdminTab } from './admin-tabs';
import { DecorBackgroundComponent } from '../../ui/decor-background/decor-background.component';

/**
 * Coquille de l'admin (`/admin/**`) : l'accès, puis les onglets. L'admin n'est pas un mécanisme
 * séparé : c'est un rôle sur le compte du joueur (le même cookie, la même connexion par lien
 * magique). Trois états, que l'API revérifie de toute façon à chaque requête :
 * - pas de compte connecté : invitation à se connecter ;
 * - compte sans le rôle : accès refusé ;
 * - admin : la barre des onglets, l'onglet ouvert, puis la déconnexion.
 * L'identifiant du navigateur est affiché dans tous les cas (repérer ses propres parties).
 */
@Component({
  selector: 'app-admin-shell-page',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe, DatePipe, BrowserIdComponent, DecorBackgroundComponent],
  providers: [ProfileStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- Mise en page de la v1 : titre et identifiant centrés, barre des onglets pleine largeur,
         déconnexion en bas. Haut de page à 32 px comme en v1 : l'avatar de l'en-tête (en haut à
         droite, en superposition) tient à côté du titre centré, même à 375 px. -->
    <main class="da-bg relative min-h-dvh flex flex-col items-center gap-6 px-4 pt-8 pb-10" style="color:var(--text-body)">
      <app-decor-background />
      <div class="relative w-full flex flex-col items-center gap-6">
      <div class="flex flex-col items-center gap-1">
        <h1 class="text-2xl font-bold tracking-tight" style="color:var(--text-hi)">{{ 'admin.title' | translate }}</h1>
        <!-- Heure du déploiement (piège 25) : seulement pour un admin connecté, et quand le build la connaît. -->
        @if (deployedAt && session.isAdmin()) {
          <p class="text-xs" style="color:var(--text-muted)" data-testid="deployed-at">
            {{ 'admin.deployedAt' | translate: { date: (deployedAt | date: 'dd/MM/yyyy à HH:mm') } }}
          </p>
        }
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
          <!-- Onglets = routes enfants ; replaceUrl : pas une entrée d'historique par clic d'onglet.
               Pool, Défis et Joueurs montrent leur effectif une fois chargés (pas avant la première ouverture). -->
          <nav class="flex gap-1 p-1 rounded-lg w-full max-w-2xl" style="background:var(--bg-surface)"
            [attr.aria-label]="'admin.title' | translate">
            @for (tab of tabs; track tab.path) {
              <a [routerLink]="['/admin', tab.path]" routerLinkActive="is-active" ariaCurrentWhenActive="page" [replaceUrl]="true"
                class="admin-tab flex-1 min-w-0 truncate text-center py-2 px-1 rounded-md text-xs sm:text-sm font-medium transition-colors">
                {{ labelOf(tab).key | translate: labelOf(tab).params }}
              </a>
            }
          </nav>
          <!-- Le contenu de l'onglet dans un bloc : sinon <router-outlet> compte comme un élément du flex et double l'écart.
               Le tableau des joueurs (7 colonnes) a besoin de plus de largeur que les autres onglets. -->
          <div class="w-full min-w-0 flex justify-center"><router-outlet /></div>
          <div class="pt-2">
            <button type="button" (click)="profile.logout()" [disabled]="profile.logoutStatus() === 'pending'"
              class="text-xs transition-colors" style="color:var(--text-faint)">
              {{ 'admin.logout' | translate }}
            </button>
          </div>
        }
      }
      </div>
    </main>
  `,
  styles: `
    .admin-tab { color: var(--text-muted); }
    .admin-tab.is-active { color: var(--text-hi); background: var(--bg-inactive); }
  `,
})
export class AdminShellPage {
  /** Ordre et libellés de la v1. */
  protected readonly tabs = ADMIN_TABS;
  protected readonly session = inject(SessionStore);
  protected readonly profile = inject(ProfileStore);
  private readonly counts = inject(AdminCounts);
  /** Heure du déploiement (piège 25), vide quand le build ne la connaît pas. */
  protected readonly deployedAt = DEPLOYED_AT;

  /** Le libellé d'un onglet : avec son effectif une fois chargé (Pool, Défis, Joueurs), nu avant. */
  protected labelOf(tab: AdminTab): { key: string; params: { count: number } | undefined } {
    const count = tab.counted ? this.counts[tab.counted.source]() : null;
    return tab.counted && count !== null ? { key: tab.counted.label, params: { count } } : { key: tab.label, params: undefined };
  }
}
