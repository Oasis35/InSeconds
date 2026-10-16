import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, NavigationEnd, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { AdminStateService } from './admin-state.service';
import { AdminTab } from '../admin.models';

// L'onglet actif vient de la route enfant (/admin/pool → data.tab = 'pool', cf. admin.routes.ts) :
// ActivatedRoute et Router sont simulés, `goTo()` imite une navigation terminée.
describe('AdminStateService', () => {
  let service: AdminStateService;
  let route: { snapshot: { firstChild: { data: { tab?: AdminTab } } | null } };
  let events: Subject<unknown>;

  function setup(tab?: AdminTab): void {
    route = { snapshot: { firstChild: tab ? { data: { tab } } : null } };
    events = new Subject();
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        AdminStateService,
        { provide: ActivatedRoute, useValue: route },
        { provide: Router, useValue: { events } },
      ],
    });
    service = TestBed.inject(AdminStateService);
  }

  function goTo(tab: AdminTab): void {
    route.snapshot.firstChild = { data: { tab } };
    events.next(new NavigationEnd(1, `/admin/${tab}`, `/admin/${tab}`));
  }

  beforeEach(() => setup());

  describe('état par défaut', () => {
    it("l'onglet actif est 'dashboard' sans route enfant", () => {
      expect(service.activeTab()).toBe('dashboard');
    });

    it("'dashboard' est considéré visité d'office (onglet d'atterrissage)", () => {
      expect(service.hasVisited('dashboard')).toBe(true);
    });

    it('les autres onglets ne sont pas visités', () => {
      expect(service.hasVisited('pool')).toBe(false);
      expect(service.hasVisited('defis')).toBe(false);
      expect(service.hasVisited('actions')).toBe(false);
    });

    it('selectedDay est le jour courant en ISO', () => {
      expect(service.selectedDay()).toBe(new Date().toISOString().slice(0, 10));
    });
  });

  describe('navigation entre onglets', () => {
    it("suit la route enfant après une navigation", () => {
      goTo('pool');
      expect(service.activeTab()).toBe('pool');
    });

    it("marque l'onglet comme visité", () => {
      expect(service.hasVisited('pool')).toBe(false);
      goTo('pool');
      expect(service.hasVisited('pool')).toBe(true);
    });

    it('un onglet reste visité après avoir changé pour un autre (sticky)', () => {
      goTo('pool');
      goTo('defis');
      goTo('dashboard');
      expect(service.hasVisited('pool')).toBe(true);
      expect(service.hasVisited('defis')).toBe(true);
      expect(service.activeTab()).toBe('dashboard');
    });

    it('ignore les événements du routeur autres que NavigationEnd', () => {
      route.snapshot.firstChild = { data: { tab: 'pool' } };
      events.next({ type: 'autre' });
      expect(service.activeTab()).toBe('dashboard');
    });
  });

  describe('ouverture directe sur un onglet (F5 sur /admin/pool)', () => {
    it("initialise l'onglet actif depuis la route enfant", () => {
      setup('pool');
      expect(service.activeTab()).toBe('pool');
    });

    it("marque l'onglet ouvert comme visité, et dashboard aussi", () => {
      setup('joueurs');
      expect(service.hasVisited('joueurs')).toBe(true);
      expect(service.hasVisited('dashboard')).toBe(true);
    });
  });

  describe('triggers de reload', () => {
    it('reloadPool() incrémente poolReloadTrigger', () => {
      const before = service.poolReloadTrigger();
      service.reloadPool();
      expect(service.poolReloadTrigger()).toBe(before + 1);
    });

    it('reloadChallenges() incrémente challengesReloadTrigger', () => {
      const before = service.challengesReloadTrigger();
      service.reloadChallenges();
      expect(service.challengesReloadTrigger()).toBe(before + 1);
    });
  });
});
