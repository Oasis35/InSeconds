import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { GameService } from './game.service';
import { environment } from '../../../environments/environment';

describe('GameService', () => {
  let service: GameService;
  let httpMock: HttpTestingController;
  const base = `${environment.apiUrl}/api/sessions`;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        GameService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    service = TestBed.inject(GameService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  describe('startToday()', () => {
    it('should POST to /api/sessions with an empty body', () => {
      const mockResponse = {
        sessionId: 42,
        isResuming: false,
        tracks: [],
        completedAnswers: [],
      };

      let result: any;
      service.startToday().subscribe(r => (result = r));

      const req = httpMock.expectOne(base);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual({});
      req.flush(mockResponse);

      expect(result).toEqual(mockResponse);
    });

    it('should propagate HTTP errors', () => {
      let error: any;
      service.startToday().subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(base);
      req.flush('Unauthorized', { status: 401, statusText: 'Unauthorized' });

      expect(error.status).toBe(401);
    });

    it('should propagate 503 when no challenge exists', () => {
      let error: any;
      service.startToday().subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(base);
      req.flush('No challenge today', { status: 503, statusText: 'Service Unavailable' });

      expect(error.status).toBe(503);
    });
  });

  describe('submitAnswer()', () => {
    it('should POST to /api/sessions/{id}/answers', () => {
      const sessionId = 7;
      const body = {
        dailyChallengeTrackId: 3,
        listenedDurationSeconds: 1.5,
        wasExtended: false,
        artistAnswer: 'Daft Punk',
        titleAnswer: 'Around the World',
      };
      const mockResponse = {
        artistCorrect: true,
        titleCorrect: true,
        score: 700,
        correctArtist: 'Daft Punk',
        correctTitle: 'Around the World',
        failureRatePercent: 20,
        averageSecondsWhenCorrect: 2,
        listenedDurationSeconds: 1.5,
      };

      let result: any;
      service.submitAnswer(sessionId, body).subscribe(r => (result = r));

      const req = httpMock.expectOne(`${base}/${sessionId}/answers`);
      expect(req.request.method).toBe('POST');
      expect(req.request.body).toEqual(body);
      req.flush(mockResponse);

      expect(result).toEqual(mockResponse);
    });

    it('should propagate 409 when session already completed', () => {
      let error: any;
      service.submitAnswer(1, {
        dailyChallengeTrackId: 1,
        listenedDurationSeconds: 1,
        wasExtended: false,
        artistAnswer: '',
        titleAnswer: '',
      }).subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(`${base}/1/answers`);
      req.flush('Conflict', { status: 409, statusText: 'Conflict' });

      expect(error.status).toBe(409);
    });
  });

  describe('abandonSession()', () => {
    it('should PUT to /api/sessions/{id}/abandon', () => {
      const sessionId = 99;
      let completed = false;
      service.abandonSession(sessionId).subscribe(() => (completed = true));

      const req = httpMock.expectOne(`${base}/${sessionId}/abandon`);
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({});
      req.flush(null);

      expect(completed).toBeTrue();
    });

    it('should propagate errors from abandonSession', () => {
      let error: any;
      service.abandonSession(5).subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(`${base}/5/abandon`);
      req.flush('Not found', { status: 404, statusText: 'Not Found' });

      expect(error.status).toBe(404);
    });
  });

  describe('updateListening()', () => {
    it('should PATCH to /api/sessions/{id}/listening with trackId and listenedSeconds', () => {
      const sessionId = 10;
      const trackId = 3;
      const listenedSeconds = 2.5;
      let completed = false;

      service.updateListening(sessionId, trackId, listenedSeconds).subscribe(() => (completed = true));

      const req = httpMock.expectOne(`${base}/${sessionId}/listening`);
      expect(req.request.method).toBe('PATCH');
      expect(req.request.body).toEqual({ trackId, listenedSeconds });
      req.flush(null);

      expect(completed).toBeTrue();
    });

    it('should propagate errors from updateListening', () => {
      let error: any;
      service.updateListening(10, 3, 1).subscribe({ error: e => (error = e) });

      const req = httpMock.expectOne(`${base}/10/listening`);
      req.flush('Error', { status: 500, statusText: 'Internal Server Error' });

      expect(error.status).toBe(500);
    });
  });
});
