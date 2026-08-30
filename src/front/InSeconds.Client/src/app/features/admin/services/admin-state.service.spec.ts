import { TestBed } from '@angular/core/testing';
import { AdminStateService } from './admin-state.service';

describe('AdminStateService', () => {
  let service: AdminStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [AdminStateService] });
    service = TestBed.inject(AdminStateService);
  });

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
