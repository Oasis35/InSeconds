import { Injectable, inject, linkedSignal, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { filter, map, startWith } from 'rxjs';
import { AdminTab } from '../admin.models';

@Injectable()
export class AdminStateService {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  private readonly _selectedDay = signal<string>(new Date().toISOString().slice(0, 10));
  readonly selectedDay = this._selectedDay.asReadonly();
  private readonly _poolSearchQuery = signal('');
  readonly poolSearchQuery = this._poolSearchQuery.asReadonly();
  private readonly _poolReloadTrigger = signal(0);
  readonly poolReloadTrigger = this._poolReloadTrigger.asReadonly();
  private readonly _challengesReloadTrigger = signal(0);
  readonly challengesReloadTrigger = this._challengesReloadTrigger.asReadonly();

  /**
   * Onglet affiché, dérivé de la route enfant active (`/admin/pool` → 'pool', cf. admin.routes.ts).
   * Porté ici (et non dans AdminComponent) pour que les rxResource d'AdminApiService puissent
   * charger paresseusement.
   */
  readonly activeTab = toSignal(
    this.router.events.pipe(
      filter(e => e instanceof NavigationEnd),
      map(() => this.readTabFromRoute()),
      startWith(this.readTabFromRoute()),
    ),
    { requireSync: true },
  );

  /**
   * Onglets déjà ouverts au moins une fois pendant la session admin courante.
   * 'dashboard' est inclus d'office (onglet d'atterrissage). Un onglet reste "visité"
   * une fois ouvert → ses données sont chargées une seule fois puis mises en cache par le rxResource.
   * L'onglet ouvert au chargement (F5 sur /admin/pool) est lui aussi marqué visité.
   */
  private readonly visitedTabs = linkedSignal<AdminTab, ReadonlySet<AdminTab>>({
    source: this.activeTab,
    computation: (tab, previous) => new Set<AdminTab>(previous?.value ?? ['dashboard']).add(tab),
  });

  private readTabFromRoute(): AdminTab {
    return (this.route.firstChild?.snapshot.data['tab'] as AdminTab | undefined) ?? 'dashboard';
  }

  hasVisited(tab: AdminTab): boolean {
    return this.visitedTabs().has(tab);
  }

  setSelectedDay(day: string): void {
    this._selectedDay.set(day);
  }

  setPoolSearchQuery(q: string): void {
    this._poolSearchQuery.set(q);
  }

  reloadPool(): void {
    this._poolReloadTrigger.update(v => v + 1);
  }

  reloadChallenges(): void {
    this._challengesReloadTrigger.update(v => v + 1);
  }
}
