import { Injectable, inject, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { AdminTab } from '../admin.models';

const VALID_TABS: ReadonlySet<AdminTab> = new Set<AdminTab>(['dashboard', 'pool', 'defis', 'allowedEmails', 'actions']);

function isAdminTab(value: string | null): value is AdminTab {
  return VALID_TABS.has(value as AdminTab);
}

@Injectable()
export class AdminStateService {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly selectedDay = signal<string>(new Date().toISOString().slice(0, 10));
  readonly poolSearchQuery = signal('');
  readonly poolReloadTrigger = signal(0);
  readonly challengesReloadTrigger = signal(0);
  readonly allowedEmailsReloadTrigger = signal(0);

  /**
   * Onglet affiché. Piloté ici (et non dans AdminComponent) pour que les rxResource d'AdminApiService
   * puissent charger paresseusement. Initialisé depuis le paramètre d'URL `?tab=` (F5 conserve l'onglet).
   */
  readonly activeTab = signal<AdminTab>(this.readTabFromUrl());

  /**
   * Onglets déjà ouverts au moins une fois pendant la session admin courante.
   * 'dashboard' est inclus d'office (onglet d'atterrissage). Un onglet reste "visité"
   * une fois ouvert → ses données sont chargées une seule fois puis mises en cache par le rxResource.
   * L'onglet restauré depuis l'URL au chargement (F5 sur un autre onglet que dashboard) est lui aussi marqué visité.
   */
  private readonly visitedTabs = signal<ReadonlySet<AdminTab>>(new Set<AdminTab>(['dashboard', this.activeTab()]));

  private readTabFromUrl(): AdminTab {
    const tab = this.route.snapshot.queryParamMap.get('tab');
    return isAdminTab(tab) ? tab : 'dashboard';
  }

  hasVisited(tab: AdminTab): boolean {
    return this.visitedTabs().has(tab);
  }

  setActiveTab(tab: AdminTab): void {
    this.activeTab.set(tab);
    if (!this.visitedTabs().has(tab)) {
      this.visitedTabs.update(s => new Set(s).add(tab));
    }
    this.router.navigate([], {
      relativeTo: this.route,
      queryParams: { tab },
      queryParamsHandling: 'merge',
      replaceUrl: true,
    });
  }

  reloadPool(): void {
    this.poolReloadTrigger.update(v => v + 1);
  }

  reloadChallenges(): void {
    this.challengesReloadTrigger.update(v => v + 1);
  }

  reloadAllowedEmails(): void {
    this.allowedEmailsReloadTrigger.update(v => v + 1);
  }
}
