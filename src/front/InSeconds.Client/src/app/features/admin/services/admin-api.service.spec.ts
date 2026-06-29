import { TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { AdminApiService } from './admin-api.service';
import { environment } from '../../../../environments/environment';

describe('AdminApiService', () => {
  let service: AdminApiService;
  let httpMock: HttpTestingController;
  const base = `${environment.apiUrl}/api/admin`;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        AdminApiService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(AdminApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  describe('initial state', () => {
    it('should have authenticated = false by default', () => {
      expect(service.authenticated()).toBeFalse();
    });

    it('should have base pointing to admin API', () => {
      expect(service.base).toBe(`${environment.apiUrl}/api/admin`);
    });
  });

  describe('login()', () => {
    it('should POST to /api/admin/login and set authenticated to true', fakeAsync(async () => {
      const loginPromise = service.login('secret');

      const req = httpMock.expectOne(`${base}/login`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({ password: 'secret' });
      req.flush({ token: 'my-admin-token' });

      await loginPromise;

      expect(service.authenticated()).toBeTrue();
      expect(localStorage.getItem('admin_token')).toBe('my-admin-token');
    }));

    it('should reject the promise on wrong password (401)', fakeAsync(async () => {
      let error: any;
      const loginPromise = service.login('wrong').catch(e => { error = e; });

      const req = httpMock.expectOne(`${base}/login`);
      req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

      await loginPromise;

      expect(error).toBeTruthy();
      expect(service.authenticated()).toBeFalse();
    }));
  });

  describe('logout()', () => {
    it('should set authenticated to false and remove token from localStorage', () => {
      localStorage.setItem('admin_token', 'some-token');
      service.authenticated.set(true);

      service.logout();

      expect(service.authenticated()).toBeFalse();
      expect(localStorage.getItem('admin_token')).toBeNull();
    });
  });

  describe('checkAuth()', () => {
    it('should set authenticated to true when GET /api/admin/me succeeds', fakeAsync(async () => {
      service.checkAuth();

      const req = httpMock.expectOne(`${base}/me`);
      expect(req.request.method).toBe('GET');
      req.flush({ id: 1 });

      // Wait for the promise to resolve
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

  describe('resetToday()', () => {
    it('should DELETE /api/admin/reset-today and return a ResetResult', () => {
      const mockResult = { deleted: 5, date: '2026-06-29' };
      let result: any;
      service.resetToday().subscribe(r => (result = r));

      const req = httpMock.expectOne(`${base}/reset-today`);
      expect(req.request.method).toBe('DELETE');
      req.flush(mockResult);

      expect(result).toEqual(mockResult);
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

  describe('updateTrack()', () => {
    it('should PUT to /api/admin/tracks/{id}', () => {
      let completed = false;
      service.updateTrack(7, 999888).subscribe(() => (completed = true));

      const req = httpMock.expectOne(`${base}/tracks/7`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({ deezerTrackId: 999888 });
      req.flush({});

      expect(completed).toBeTrue();
    });

    it('should propagate 409 when deezerTrackId already exists', () => {
      let error: any;
      service.updateTrack(7, 999888).subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(`${base}/tracks/7`);
      req.flush('Conflict', { status: 409, statusText: 'Conflict' });

      expect(error.status).toBe(409);
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
