import { Injectable, signal } from '@angular/core';
import { AdminTab } from '../admin.models';

@Injectable()
export class AdminStateService {
  readonly selectedDay = signal<string>(new Date().toISOString().slice(0, 10));
  readonly poolSearchQuery = signal('');
  readonly poolReloadTrigger = signal(0);
  readonly challengesReloadTrigger = signal(0);

  /** Onglet affiché. Piloté ici (et non dans AdminComponent) pour que les rxResource d'AdminApiService puissent charger paresseusement. */
  readonly activeTab = signal<AdminTab>('dashboard');

  /**
   * Onglets déjà ouverts au moins une fois pendant la session admin courante.
   * 'dashboard' est inclus d'office (onglet d'atterrissage). Un onglet reste "visité"
   * une fois ouvert → ses données sont chargées une seule fois puis mises en cache par le rxResource.
   */
  private readonly visitedTabs = signal<ReadonlySet<AdminTab>>(new Set<AdminTab>(['dashboard']));

  hasVisited(tab: AdminTab): boolean {
    return this.visitedTabs().has(tab);
  }

  setActiveTab(tab: AdminTab): void {
    this.activeTab.set(tab);
    if (!this.visitedTabs().has(tab)) {
      this.visitedTabs.update(s => new Set(s).add(tab));
    }
  }

  reloadPool(): void {
    this.poolReloadTrigger.update(v => v + 1);
  }

  reloadChallenges(): void {
    this.challengesReloadTrigger.update(v => v + 1);
  }
}
