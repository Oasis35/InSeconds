import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { SettingsService } from './settings.service';
import { environment } from '../../../environments/environment';

describe('SettingsService', () => {
  let service: SettingsService;
  let httpMock: HttpTestingController;
  const settingsUrl = `${environment.apiUrl}/api/settings`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        SettingsService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(SettingsService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('initial signal values', () => {
    it('should have default allowedDurations', () => {
      expect(service.allowedDurations()).toEqual([0.5, 1, 1.5, 2, 3, 5, 10]);
    });

    it('should have default guessTimerSeconds of 20', () => {
      expect(service.guessTimerSeconds()).toBe(20);
    });

    it('should have default tracksPerChallenge of 10', () => {
      expect(service.tracksPerChallenge()).toBe(10);
    });

    it('should have default durationScores', () => {
      const scores = service.durationScores();
      expect(scores[0.5]).toBe(1000);
      expect(scores[1]).toBe(850);
      expect(scores[10]).toBe(100);
    });
  });

  describe('load()', () => {
    it('should GET /api/settings', () => {
      service.load().subscribe();

      const req = httpMock.expectOne(settingsUrl);
      expect(req.request.method).toBe('GET');
      req.flush({
        allowedDurationsSeconds: [0.5, 1, 2, 5],
        guessTimerSeconds: 30,
        tracksPerChallenge: 5,
        durationScores: { '0.5': 1000, '1': 800, '2': 500, '5': 200 },
      });
    });

    it('should update allowedDurations signal after load', () => {
      service.load().subscribe();

      const req = httpMock.expectOne(settingsUrl);
      req.flush({
        allowedDurationsSeconds: [1, 2, 5],
        guessTimerSeconds: 20,
        tracksPerChallenge: 3,
        durationScores: { '1': 800 },
      });

      expect(service.allowedDurations()).toEqual([1, 2, 5]);
    });

    it('should update guessTimerSeconds signal after load', () => {
      service.load().subscribe();

      const req = httpMock.expectOne(settingsUrl);
      req.flush({
        allowedDurationsSeconds: [0.5],
        guessTimerSeconds: 45,
        tracksPerChallenge: 3,
        durationScores: {},
      });

      expect(service.guessTimerSeconds()).toBe(45);
    });

    it('should update tracksPerChallenge signal after load', () => {
      service.load().subscribe();

      const req = httpMock.expectOne(settingsUrl);
      req.flush({
        allowedDurationsSeconds: [],
        guessTimerSeconds: 20,
        tracksPerChallenge: 7,
        durationScores: {},
      });

      expect(service.tracksPerChallenge()).toBe(7);
    });

    it('should convert durationScores keys to numbers', () => {
      service.load().subscribe();

      const req = httpMock.expectOne(settingsUrl);
      req.flush({
        allowedDurationsSeconds: [],
        guessTimerSeconds: 20,
        tracksPerChallenge: 3,
        durationScores: { '0.5': 1000, '1.5': 700, '10': 100 },
      });

      const scores = service.durationScores();
      expect(scores[0.5]).toBe(1000);
      expect(scores[1.5]).toBe(700);
      expect(scores[10]).toBe(100);
    });

    it('should complete the observable with void after load', () => {
      let emittedValue: any = 'not-set';
      service.load().subscribe(v => (emittedValue = v));

      const req = httpMock.expectOne(settingsUrl);
      req.flush({
        allowedDurationsSeconds: [],
        guessTimerSeconds: 20,
        tracksPerChallenge: 3,
        durationScores: {},
      });

      expect(emittedValue).toBeUndefined();
    });

    it('should swallow HTTP errors so app bootstrap is not blocked', () => {
      let error: any = null;
      let completed = false;
      service.load().subscribe({ error: e => (error = e), complete: () => (completed = true) });

      const req = httpMock.expectOne(settingsUrl);
      req.flush('Server error', { status: 500, statusText: 'Internal Server Error' });

      expect(error).toBeNull();
      expect(completed).toBeTrue();
    });

    it('should not update signals when load fails', () => {
      const originalDurations = service.allowedDurations();
      service.load().subscribe({ error: () => {} });

      const req = httpMock.expectOne(settingsUrl);
      req.flush('error', { status: 500, statusText: 'Server Error' });

      // signals should retain their default values
      expect(service.allowedDurations()).toEqual(originalDurations);
    });
  });
});
