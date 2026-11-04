import { WIDE_SCREEN } from '../../../core/layout/wide-screen';
import { DatePipe, DOCUMENT, NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { BrowserIdComponent } from '../../../account/feature/browser-id/browser-id.component';
import { ProfileStore } from '../../../account/data-access/profile.store';
import { SessionStore } from '../../../core/session/session.store';
import { AdminCounts } from '../../data-access/admin-counts';
import { GRAFANA_DASHBOARD_URL, JOBS_DASHBOARD_URL } from '../../data-access/admin-api.providers';
import { ciRunsPage } from '../../data-access/github-ci.api';
import { SystemStore } from '../../data-access/system.store';
import { CiLine, TechPanelComponent } from '../../ui/system/tech-panel/tech-panel.component';
import { VersionService } from '../../../core/version/version.service';
import { ADMIN_TABS, AdminTab } from '../admin-tabs';
import { ButtonComponent } from '../../../ui/button/button.component';
import { DecorBackgroundComponent } from '../../../ui/decor-background/decor-background.component';

/**
 * Coquille de l'admin (`/admin/**`) : l'accès, puis les onglets. L'admin n'est pas un mécanisme
 * séparé : c'est un rôle sur le compte du joueur (le même cookie, la même connexion par lien
 * magique). Trois états, que l'API revérifie de toute façon à chaque requête :
 * - pas de compte connecté : invitation à se connecter (texte centré, bouton orange de la DA) ;
 * - compte sans le rôle : accès refusé ;
 * - admin : deux mises en page. Sur téléphone, une ligne en haut (le logo « IN// », lien vers le jeu ; la date du déploiement au
 *   milieu ; à droite le bouton d'état, qui déplie le panneau technique) et les onglets dans une barre fixe en bas, sous le pouce.
 *   Sur PC (`lg`), une barre à gauche : le logo IN//SECONDS (lien vers le jeu), les onglets en colonne, puis le panneau technique.
 *   Le panneau finit par l'identifiant du navigateur et la déconnexion.
 * L'identifiant du navigateur est affiché dans tous les cas (repérer ses propres parties).
 * Une nouvelle version s'applique quand l'onglet passe en arrière-plan, sauf pendant une saisie (un champ de texte a le
 * focus) : elle attend alors le prochain changement de page.
 */
/** Les `<input>` qu'on ne remplit pas au clavier : leur focus n'est pas une saisie en cours. */
const NON_TEXT_INPUTS = new Set(['button', 'checkbox', 'radio', 'range', 'reset', 'submit', 'color', 'file', 'image']);

@Component({
  selector: 'app-admin-shell-page',
  imports: [
    RouterOutlet, RouterLink, RouterLinkActive, TranslatePipe, DatePipe, NgTemplateOutlet, BrowserIdComponent, DecorBackgroundComponent,
    ButtonComponent, TechPanelComponent,
  ],
  providers: [ProfileStore, SystemStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '(focusin)': 'editing.set(isTextField($event.target))',
    '(focusout)': 'onFocusOut($event)',
    '(document:visibilitychange)': 'onVisibilityChange()',
  },
  template: `
    <ng-template #techPanel>
      <app-tech-panel
        [deployedAt]="system.build.deployedAt" [frontCommit]="system.build.commit" [apiCommit]="system.info()?.commit ?? null"
        [branch]="system.build.branch" [branchHead]="system.branchHead()" [verdict]="system.verdict()"
        [apiDown]="system.health.state() === 'ko'" [latencyMs]="system.health.latencyMs()"
        [backup]="system.backup()" [backupAt]="system.info()?.lastBackupAt ?? null" [backupOffSite]="system.info()?.lastBackupOffSite ?? null"
        [jobs]="system.jobs()" [jobsFailed]="system.lastRunsFailed()" [ci]="ciLines()" [jobsUrl]="jobsUrl" [grafanaUrl]="grafanaUrl"
        [catalogue]="system.catalogue()" [nextChallenge]="system.nextChallengeState()">
        <section>
          <h2 class="text-xs font-semibold mb-1.5" style="color:var(--text-faint)">{{ 'admin.system.browser' | translate }}</h2>
          <app-browser-id />
        </section>
        <button type="button" (click)="profile.logout()" [disabled]="profile.logoutStatus() === 'pending'"
          class="self-start text-xs transition-colors hover:text-(--text-hi)" style="color:var(--text-faint)">
          {{ 'admin.logout' | translate }}
        </button>
      </app-tech-panel>
    </ng-template>

    <main class="da-bg relative min-h-dvh" [class.admin-with-bottom-nav]="session.loaded() && session.isAdmin()" style="color:var(--text-body)">
      <app-decor-background />
      @if (session.loaded()) {
        @if (!session.isLinked()) {
          <section class="relative w-full max-w-2xl mx-auto px-4 pt-16 flex flex-col items-center gap-3 text-center" data-testid="admin-gate">
            <h2 class="text-lg font-semibold" style="color:var(--text-hi)">{{ 'admin.notLoggedIn' | translate }}</h2>
            <p class="text-sm" style="color:var(--text-muted)">{{ 'admin.notLoggedInBody' | translate }}</p>
            <a appButton routerLink="/account/login" class="mt-2">{{ 'admin.goToLogin' | translate }}</a>
            <div class="pt-4"><app-browser-id /></div>
          </section>
        } @else if (!session.isAdmin()) {
          <section class="relative w-full max-w-2xl mx-auto px-4 pt-16 flex flex-col items-center gap-3 text-center" data-testid="admin-gate">
            <h2 class="text-lg font-semibold" style="color:var(--text-hi)">{{ 'admin.accessDenied' | translate }}</h2>
            <p class="text-sm" style="color:var(--text-muted)">{{ 'admin.accessDeniedBody' | translate }}</p>
            <a appButton routerLink="/daily" class="mt-2">{{ 'admin.backToGame' | translate }}</a>
            <div class="pt-4"><app-browser-id /></div>
          </section>
        } @else {
          <!-- Téléphone : une seule ligne en haut, le panneau technique se déplie dessous. -->
          <header class="lg:hidden relative px-4 pt-3 pb-2">
            <div class="flex items-center gap-2">
              <a routerLink="/daily" [attr.aria-label]="'admin.backToGame' | translate" [title]="'admin.backToGame' | translate"
                class="shrink-0 font-extrabold uppercase text-base tracking-[0.14em] px-1" style="font-family:var(--font-display);color:var(--text-hi)">IN<span style="color:var(--text-accent)">//</span></a>
              <span class="flex-1 min-w-0 truncate text-center text-xs" style="color:var(--text-muted)" data-testid="deployed-at-short">
                @if (system.build.deployedAt; as at) {
                  {{ 'admin.deployedShort' | translate: { date: (at | date: 'dd/MM'), time: (at | date: 'HH:mm') } }}
                }
              </span>
              <button type="button" (click)="techOpen.set(!techOpen())" [attr.aria-expanded]="techOpen()" aria-controls="admin-tech-mobile"
                [attr.aria-label]="(system.alerts() > 0 ? 'admin.system.statusAlerts' : 'admin.system.statusOk') | translate: { count: system.alerts() }"
                class="shrink-0 inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full" data-testid="tech-toggle"
                style="border:1px solid var(--border-neutral)" [style.color]="system.alerts() > 0 ? 'var(--text-error)' : 'var(--text-light)'">
                <span aria-hidden="true" [style.color]="system.alerts() > 0 ? 'var(--text-error)' : 'var(--color-success)'">●</span>
                @if (system.alerts() > 0) { <span aria-hidden="true">{{ 'admin.system.alerts' | translate: { count: system.alerts() } }}</span> }
                <span aria-hidden="true">{{ techOpen() ? '▴' : '▾' }}</span>
              </button>
            </div>
            @if (techOpen() && !wide()) {
              <div id="admin-tech-mobile" class="mt-2 rounded-xl p-4" style="background:var(--bg-surface)">
                <ng-container *ngTemplateOutlet="techPanel" />
              </div>
            }
          </header>

          <div class="relative w-full max-w-2xl lg:max-w-none mx-auto px-4 lg:px-6 lg:pt-3 lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-x-6 lg:gap-y-3">
            <!-- PC : le logo (aligné sur le texte du panneau technique) et les onglets (alignés sur le contenu) sur une ligne en haut. -->
            <a routerLink="/daily" [title]="'admin.backToGame' | translate"
              class="hidden lg:block self-center px-4 font-extrabold uppercase text-base tracking-[0.14em]" style="font-family:var(--font-display);color:var(--text-hi)">
              IN<span style="color:var(--text-accent)">//</span>SECONDS
            </a>
            <nav data-testid="admin-top-nav" class="hidden lg:flex justify-self-start gap-1 rounded-xl p-1.5" style="background:var(--bg-surface)" [attr.aria-label]="'admin.tabsLabel' | translate">
              @for (tab of tabs; track tab.path) {
                <a [routerLink]="['/admin', tab.path]" routerLinkActive="is-active" ariaCurrentWhenActive="page" [replaceUrl]="true"
                  class="admin-tab px-3 py-2 rounded-lg text-sm font-medium transition-colors">
                  {{ labelOf(tab).key | translate: labelOf(tab).params }}
                </a>
              }
            </nav>
            <!-- PC : le panneau technique dans la colonne de gauche. -->
            <aside class="hidden lg:block lg:sticky lg:top-4 lg:self-start">
              @if (wide()) {
                <div class="rounded-xl p-4" style="background:var(--bg-surface)">
                  <ng-container *ngTemplateOutlet="techPanel" />
                </div>
              }
            </aside>
            <!-- Le contenu de l'onglet dans un bloc : sinon <router-outlet> compte comme un élément de la grille. -->
            <div class="min-w-0 pb-4 lg:pb-10"><router-outlet /></div>
          </div>

          <!-- Téléphone : les onglets en bas, fond opaque (rien ne passe dessous en transparence). -->
          <nav class="lg:hidden fixed bottom-0 inset-x-0 z-10 grid grid-cols-4 gap-1 px-2 pt-1.5 pb-[max(0.5rem,env(safe-area-inset-bottom))]"
            style="background:var(--bg-page);border-top:1px solid var(--border-medium)" [attr.aria-label]="'admin.tabsLabel' | translate"
            data-testid="admin-bottom-nav">
            @for (tab of tabs; track tab.path) {
              <a [routerLink]="['/admin', tab.path]" routerLinkActive="is-active" ariaCurrentWhenActive="page" [replaceUrl]="true"
                class="admin-tab min-w-0 truncate text-center py-2 rounded-lg text-xs font-medium transition-colors">{{ tab.label | translate }}</a>
            }
          </nav>
        }
      }
    </main>
  `,
  styles: `
    .admin-tab { color: var(--text-muted); }
    .admin-tab.is-active { color: var(--text-hi); background: var(--bg-inactive); }
    /* Place pour la barre d'onglets fixe du téléphone, sous le contenu. */
    .admin-with-bottom-nav { padding-bottom: calc(4rem + env(safe-area-inset-bottom)); }
    @media (min-width: 1024px) { .admin-with-bottom-nav { padding-bottom: 0; } }
  `,
})
export class AdminShellPage {
  /** Ordre et libellés des onglets. */
  protected readonly tabs = ADMIN_TABS;
  protected readonly session = inject(SessionStore);
  protected readonly profile = inject(ProfileStore);
  private readonly counts = inject(AdminCounts);
  private readonly document = inject(DOCUMENT);
  /** L'état technique (déploiement, santé, tâches, CI), lu une fois l'admin reconnu. */
  protected readonly system = inject(SystemStore);
  protected readonly jobsUrl = inject(JOBS_DASHBOARD_URL);
  protected readonly grafanaUrl = GRAFANA_DASHBOARD_URL;
  /** PC : le panneau technique est dans la barre de gauche ; téléphone : sous la ligne du haut. Il n'est rendu qu'à un endroit. */
  protected readonly wide = inject(WIDE_SCREEN);
  /** Le panneau technique est déplié sous la ligne du haut (téléphone). */
  protected readonly techOpen = signal(false);
  /** Un champ de texte de l'admin a le focus : une nouvelle version attend le prochain changement de page. */
  protected readonly editing = signal(false);

  /** La CI de la prod puis du staging, chacune liée à son dernier passage (ou à la liste des passages de sa branche). */
  protected readonly ciLines = computed<CiLine[]>(() => this.system.ciRuns().map(({ branch, run }) => ({
    labelKey: branch === 'main' ? 'admin.system.ciProd' : 'admin.system.ciStaging',
    run,
    url: ciRunsPage(branch),
  })));

  constructor() {
    inject(VersionService).allowReload(() => (this.editing() ? 'navigation' : 'background'), inject(DestroyRef));
    // L'état technique ne se lit qu'une fois l'admin reconnu : ses routes répondraient 403 à un autre compte.
    let loaded = false;
    effect(() => {
      if (!this.session.isAdmin() || loaded) return;
      loaded = true;
      untracked(() => void this.system.load());
    });
  }

  /** De retour sur l'onglet : l'état technique est relu (un admin laisse souvent l'onglet ouvert d'un jour à l'autre). */
  protected onVisibilityChange(): void {
    if (this.document.visibilityState === 'visible' && this.session.isAdmin()) void this.system.load();
  }

  /** La fenêtre qui perd le focus (barre d'adresse, autre onglet) n'est pas la fin de la saisie : le champ le garde au retour. */
  protected onFocusOut(event: FocusEvent): void {
    if (event.relatedTarget === null && !this.document.hasFocus()) return;
    this.editing.set(this.isTextField(event.relatedTarget));
  }

  protected isTextField(target: EventTarget | null): boolean {
    if (target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement) return true;
    if (target instanceof HTMLInputElement) return !NON_TEXT_INPUTS.has(target.type);
    return target instanceof HTMLElement && target.isContentEditable;
  }

  /** Le libellé d'un onglet : avec son effectif une fois chargé (Pool, Défis, Joueurs), nu avant. */
  protected labelOf(tab: AdminTab): { key: string; params: { count: number } | undefined } {
    const count = tab.counted ? this.counts[tab.counted.source]() : null;
    return tab.counted && count !== null ? { key: tab.counted.label, params: { count } } : { key: tab.label, params: undefined };
  }
}
