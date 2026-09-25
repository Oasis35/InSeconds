import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AdminHttpService } from './admin-http.service';
import { AdminApiService } from './admin-api.service';
import { AdminStateService } from './admin-state.service';
import { PlayerSessionService } from '../../../core/services/player-session.service';
import { environment } from '../../../../environments/environment';

describe('AdminHttpService', () => {
  let service: AdminHttpService;
  let httpMock: HttpTestingController;
  let playerSessionStub: { logout: jasmine.Spy; load: jasmine.Spy };
  const base = `${environment.apiUrl}/api/admin`;

  beforeEach(() => {
    playerSessionStub = {
      logout: jasmine.createSpy('logout').and.returnValue(of(undefined)),
      load: jasmine.createSpy('load').and.returnValue(of(undefined)),
    };

    TestBed.configureTestingModule({
      providers: [
        AdminHttpService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: PlayerSessionService, useValue: playerSessionStub },
      ],
    });
    service = TestBed.inject(AdminHttpService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('initial state', () => {
    it('should have authenticated = false by default', () => {
      expect(service.authenticated()).toBeFalse();
    });

    it('should expose base URL pointing to admin API', () => {
      expect(service.base).toBe(`${environment.apiUrl}/api/admin`);
    });
  });

  describe('logout()', () => {
    it('should delegate to PlayerSessionService, reload the session, then set authenticated to false', async () => {
      service.authenticated.set(true);

      await service.logout();

      expect(playerSessionStub.logout).toHaveBeenCalled();
      expect(playerSessionStub.load).toHaveBeenCalled();
      expect(service.authenticated()).toBeFalse();
    });
  });

  describe('checkAuth()', () => {
    it('should set authenticated to true when GET /api/admin/me succeeds', fakeAsync(async () => {
      service.checkAuth();

      const req = httpMock.expectOne(`${base}/me`);
      expect(req.request.method).toBe('GET');
      req.flush({ id: 1 });

      await Promise.resolve();
      tick();

      expect(service.authenticated()).toBeTrue();
    }));

    it('should set authenticated to false when GET /api/admin/me fails (401)', fakeAsync(async () => {
      service.authenticated.set(true);
      service.checkAuth();

      const req = httpMock.expectOne(`${base}/me`);
      req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

      await Promise.resolve();
      tick();

      expect(service.authenticated()).toBeFalse();
    }));
  });

  describe('generateToday()', () => {
    it('should POST to /api/admin/generate-today', () => {
      let completed = false;
      service.generateToday().subscribe(() => (completed = true));

      const req = httpMock.expectOne(`${base}/generate-today`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush({});

      expect(completed).toBeTrue();
    });

    it('should propagate 409 when challenge already exists', () => {
      let error: any;
      service.generateToday().subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(`${base}/generate-today`);
      req.flush('Conflict', { status: 409, statusText: 'Conflict' });

      expect(error.status).toBe(409);
    });

    it('should propagate 422 when pool is insufficient', () => {
      let error: any;
      service.generateToday().subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(`${base}/generate-today`);
      req.flush('Unprocessable', { status: 422, statusText: 'Unprocessable Entity' });

      expect(error.status).toBe(422);
    });
  });

  describe('getChallengeStats()', () => {
    it('should GET /api/admin/challenge-stats (distinct de /challenges)', () => {
      let result: any;
      service.getChallengeStats().subscribe(r => (result = r));

      const req = httpMock.expectOne(`${base}/challenge-stats`);
      expect(req.request.method).toBe('GET');
      const body = { challenges: [] };
      req.flush(body);

      expect(result).toEqual(body);
      httpMock.expectNone(`${base}/challenges`);
    });
  });

  describe('getRegisteredPlayers()', () => {
    it('should GET /api/admin/players', () => {
      let result: any;
      service.getRegisteredPlayers().subscribe(r => (result = r));

      const req = httpMock.expectOne(`${base}/players`);
      expect(req.request.method).toBe('GET');
      const body = { players: [] };
      req.flush(body);

      expect(result).toEqual(body);
    });
  });

  describe('getPlayerHistory()', () => {
    it('should GET /api/admin/players/{id}/history', () => {
      let result: any;
      service.getPlayerHistory('abc-123').subscribe(r => (result = r));

      const req = httpMock.expectOne(`${base}/players/abc-123/history`);
      expect(req.request.method).toBe('GET');
      const body = { games: [] };
      req.flush(body);

      expect(result).toEqual(body);
    });
  });

  describe('renameTrack()', () => {
    it('should PATCH /api/admin/tracks/{id} with artist and title', () => {
      service.renameTrack(5, 'Étienne Daho', 'Week-end à Rome').subscribe();

      const req = httpMock.expectOne(`${base}/tracks/5`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ artist: 'Étienne Daho', title: 'Week-end à Rome' });
      req.flush({ id: 5, artist: 'Étienne Daho', title: 'Week-end à Rome' });
    });
  });

  describe('setTrackDisabled()', () => {
    it('should PUT /api/admin/tracks/{id}/disabled with isDisabled', () => {
      service.setTrackDisabled(7, true).subscribe();

      const req = httpMock.expectOne(`${base}/tracks/7/disabled`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ isDisabled: true });
      req.flush({ id: 7, isDisabled: true });
    });
  });

  describe('addTrack()', () => {
    it('should POST to /api/admin/tracks with deezerTrackId', () => {
      let completed = false;
      service.addTrack(123456).subscribe(() => (completed = true));

      const req = httpMock.expectOne(`${base}/tracks`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ deezerTrackId: 123456 });
      req.flush({});

      expect(completed).toBeTrue();
    });

    it('should propagate errors from addTrack', () => {
      let error: any;
      service.addTrack(0).subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(`${base}/tracks`);
      req.flush('Not Found', { status: 404, statusText: 'Not Found' });

      expect(error.status).toBe(404);
    });
  });

  describe('deleteTrack()', () => {
    it('should DELETE /api/admin/tracks/{id}', () => {
      let completed = false;
      service.deleteTrack(42).subscribe(() => (completed = true));

      const req = httpMock.expectOne(`${base}/tracks/42`);
      expect(req.request.method).toBe('DELETE');
      req.flush(null);

      expect(completed).toBeTrue();
    });

    it('should propagate 409 when track is used in a challenge', () => {
      let error: any;
      service.deleteTrack(42).subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(`${base}/tracks/42`);
      req.flush('Conflict', { status: 409, statusText: 'Conflict' });

      expect(error.status).toBe(409);
    });
  });
});

describe('AdminApiService — delegation', () => {
  let apiService: AdminApiService;
  let httpService: AdminHttpService;
  let stateService: AdminStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        AdminHttpService,
        AdminStateService,
        AdminApiService,
        provideHttpClient(),
        provideHttpClientTesting(),
        provideRouter([]),
        {
          provide: PlayerSessionService,
          useValue: { logout: () => of(undefined), load: () => of(undefined) },
        },
      ],
    });
    apiService = TestBed.inject(AdminApiService);
    httpService = TestBed.inject(AdminHttpService);
    stateService = TestBed.inject(AdminStateService);
  });

  it('should expose authenticated signal from AdminHttpService', () => {
    expect(apiService.authenticated()).toBeFalse();
    httpService.authenticated.set(true);
    expect(apiService.authenticated()).toBeTrue();
  });

  it('should expose selectedDay signal from AdminStateService', () => {
    const today = new Date().toISOString().slice(0, 10);
    expect(apiService.selectedDay()).toBe(today);
  });

  it('logout() should delegate to AdminHttpService', async () => {
    httpService.authenticated.set(true);
    await apiService.logout();
    expect(httpService.authenticated()).toBeFalse();
  });

  it('reloadPool() should increment poolReloadTrigger', () => {
    const before = stateService.poolReloadTrigger();
    apiService.reloadPool();
    expect(stateService.poolReloadTrigger()).toBe(before + 1);
  });
});
