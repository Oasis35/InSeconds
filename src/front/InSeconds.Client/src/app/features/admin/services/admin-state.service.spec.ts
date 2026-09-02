import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap } from '@angular/router';
import { AdminStateService } from './admin-state.service';

describe('AdminStateService', () => {
  let service: AdminStateService;
  let routerNavigateSpy: jasmine.Spy;

  function setup(queryParams: Record<string, string> = {}): void {
    routerNavigateSpy = jasmine.createSpy('navigate').and.resolveTo(true);
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        AdminStateService,
        {
          provide: ActivatedRoute,
          useValue: { snapshot: { queryParamMap: convertToParamMap(queryParams) } },
        },
        { provide: Router, useValue: { navigate: routerNavigateSpy } },
      ],
    });
    service = TestBed.inject(AdminStateService);
  }

  beforeEach(() => setup());

  describe('état par défaut', () => {
    it("l'onglet actif est 'dashboard'", () => {
      expect(service.activeTab()).toBe('dashboard');
    });

    it("'dashboard' est considéré visité d'office (onglet d'atterrissage)", () => {
      expect(service.hasVisited('dashboard')).toBeTrue();
    });

    it('les autres onglets ne sont pas visités', () => {
      expect(service.hasVisited('pool')).toBeFalse();
      expect(service.hasVisited('defis')).toBeFalse();
      expect(service.hasVisited('actions')).toBeFalse();
    });

    it('selectedDay est le jour courant en ISO', () => {
      expect(service.selectedDay()).toBe(new Date().toISOString().slice(0, 10));
    });
  });

  describe('setActiveTab()', () => {
    it("met à jour l'onglet actif", () => {
      service.setActiveTab('pool');
      expect(service.activeTab()).toBe('pool');
    });

    it("marque l'onglet comme visité", () => {
      expect(service.hasVisited('pool')).toBeFalse();
      service.setActiveTab('pool');
      expect(service.hasVisited('pool')).toBeTrue();
    });

    it('un onglet reste visité après avoir changé pour un autre (sticky)', () => {
      service.setActiveTab('pool');
      service.setActiveTab('defis');
      service.setActiveTab('dashboard');
      expect(service.hasVisited('pool')).toBeTrue();
      expect(service.hasVisited('defis')).toBeTrue();
      expect(service.activeTab()).toBe('dashboard');
    });

    it('revisiter un onglet ne casse pas le Set des visités', () => {
      service.setActiveTab('pool');
      service.setActiveTab('pool');
      expect(service.hasVisited('pool')).toBeTrue();
    });
  });

  describe('restauration depuis le paramètre d’URL ?tab=', () => {
    it("initialise l'onglet actif depuis ?tab= s'il est valide", () => {
      setup({ tab: 'pool' });
      expect(service.activeTab()).toBe('pool');
    });

    it("marque l'onglet restauré comme visité (F5 sur cet onglet ne recharge pas la page vide)", () => {
      setup({ tab: 'defis' });
      expect(service.hasVisited('defis')).toBeTrue();
    });

    it('retombe sur dashboard si ?tab= est absent ou invalide', () => {
      setup({ tab: 'not-a-real-tab' });
      expect(service.activeTab()).toBe('dashboard');
    });
  });

  describe('synchronisation de l’URL', () => {
    it("setActiveTab() met à jour le paramètre d'URL ?tab= (replaceUrl, sans polluer l'historique)", () => {
      service.setActiveTab('pool');
      expect(routerNavigateSpy).toHaveBeenCalledWith([], jasmine.objectContaining({
        queryParams: { tab: 'pool' },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      }));
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
