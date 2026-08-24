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

  describe('declareDefaultConsent()', () => {
    it('should push a consent default (all denied) without loading the gtag.js script', () => {
      service.declareDefaultConsent();

      expect(window.dataLayer).toBeDefined();
      const entry = window.dataLayer!.find(
        (e) => Array.isArray(e) && e[0] === 'consent' && e[1] === 'default',
      ) as unknown[] | undefined;

      expect(entry).toBeDefined();
      expect(entry![2]).toEqual({
        analytics_storage: 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
      });
      expect(document.querySelectorAll('script[src*="googletagmanager"]')).toHaveSize(0);
    });
  });

  describe('enable()', () => {
    it('should come after a prior consent default when declareDefaultConsent() was called first', () => {
      service.declareDefaultConsent();
      service.enable();

      const defaultIndex = window.dataLayer!.findIndex(
        (entry) => Array.isArray(entry) && entry[0] === 'consent' && entry[1] === 'default',
      );
      const updateIndex = window.dataLayer!.findIndex(
        (entry) => Array.isArray(entry) && entry[0] === 'consent' && entry[1] === 'update',
      );

      expect(defaultIndex).toBe(0);
      expect(updateIndex).toBeGreaterThan(defaultIndex);
    });


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
