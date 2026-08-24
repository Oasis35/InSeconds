import { TestBed } from '@angular/core/testing';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  let service: AnalyticsService;

  beforeEach(() => {
    delete window.gtag;
    delete window.dataLayer;
    document.querySelectorAll('script[src*="googletagmanager"]').forEach((el) => el.remove());

    TestBed.configureTestingModule({ providers: [AnalyticsService] });
    service = TestBed.inject(AnalyticsService);
  });

  afterEach(() => {
    delete window.gtag;
    delete window.dataLayer;
    document.querySelectorAll('script[src*="googletagmanager"]').forEach((el) => el.remove());
  });

  describe('enable()', () => {
    it('should initialize dataLayer and gtag, and configure the measurement ID', () => {
      service.enable();

      expect(window.dataLayer).toBeDefined();
      expect(window.gtag).toBeDefined();
      expect(window.dataLayer!.some((entry) => Array.isArray(entry) && entry[0] === 'config')).toBeTrue();
    });

    it('should grant Consent Mode v2 analytics_storage before configuring gtag (sinon gtag.js n\'envoie aucun hit)', () => {
      service.enable();

      const consentIndex = window.dataLayer!.findIndex(
        (entry) => Array.isArray(entry) && entry[0] === 'consent' && entry[1] === 'update',
      );
      const configIndex = window.dataLayer!.findIndex((entry) => Array.isArray(entry) && entry[0] === 'config');

      expect(consentIndex).toBeGreaterThan(-1);
      expect((window.dataLayer![consentIndex] as unknown[])[2]).toEqual({ analytics_storage: 'granted' });
      expect(consentIndex).toBeLessThan(configIndex);
    });

    it('should inject the gtag.js script exactly once even if called twice', () => {
      service.enable();
      service.enable();

      const scripts = document.querySelectorAll('script[src*="googletagmanager"]');
      expect(scripts).toHaveSize(1);
    });
  });

  describe('disable()', () => {
    it('should not throw when gtag was never initialized', () => {
      expect(() => service.disable()).not.toThrow();
    });

    it('should update consent to denied when gtag exists', () => {
      service.enable();
      const gtagSpy: jasmine.Spy = spyOn(window, 'gtag' as never).and.callThrough();

      service.disable();

      expect(gtagSpy).toHaveBeenCalledWith('consent', 'update', { analytics_storage: 'denied' });
    });
  });
});
