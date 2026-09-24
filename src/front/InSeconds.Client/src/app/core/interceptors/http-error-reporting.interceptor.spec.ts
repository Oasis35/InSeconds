import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { extractTraceId, httpErrorReportingInterceptor } from './http-error-reporting.interceptor';
import { ErrorReportingService } from '../services/error-reporting.service';

describe('httpErrorReportingInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let reporting: jasmine.SpyObj<ErrorReportingService> & { lastErrorCode: { set: jasmine.Spy } };
  const traceId = '0123456789abcdef0123456789abcdef';

  beforeEach(() => {
    reporting = Object.assign(jasmine.createSpyObj<ErrorReportingService>('ErrorReportingService', ['report']), {
      lastErrorCode: jasmine.createSpyObj('lastErrorCode', ['set']),
    }) as never;
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([httpErrorReportingInterceptor])),
        provideHttpClientTesting(),
        { provide: ErrorReportingService, useValue: reporting },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  /** Laisse la relecture asynchrone du corps d'erreur se terminer. */
  const flushMicrotasks = () => new Promise(resolve => setTimeout(resolve));

  it('remonte un 500 avec le code d\'erreur de l\'API et re-propage l\'erreur', async () => {
    let propagated = false;
    http.get('/api/sessions/today').subscribe({ error: () => (propagated = true) });

    httpMock.expectOne('/api/sessions/today').flush({ traceId }, { status: 500, statusText: 'Server Error' });
    await flushMicrotasks();

    expect(propagated).toBeTrue();
    expect(reporting.lastErrorCode.set).toHaveBeenCalledWith(traceId);
    expect(reporting.report).toHaveBeenCalledWith(jasmine.objectContaining({
      source: 'http', httpStatus: 500, relatedTraceId: traceId, url: '/api/sessions/today',
    }));
  });

  it('remonte un échec réseau (status 0)', async () => {
    http.get('/api/settings').subscribe({ error: () => undefined });

    httpMock.expectOne('/api/settings').error(new ProgressEvent('error'), { status: 0 });
    await flushMicrotasks();

    expect(reporting.report).toHaveBeenCalledWith(jasmine.objectContaining({ source: 'http', httpStatus: 0 }));
  });

  it('ignore les réponses métier 4xx', async () => {
    http.post('/api/sessions', {}).subscribe({ error: () => undefined });

    httpMock.expectOne('/api/sessions').flush({ error: 'already_played' }, { status: 409, statusText: 'Conflict' });
    await flushMicrotasks();

    expect(reporting.report).not.toHaveBeenCalled();
  });

  it('ignore le polling /health', async () => {
    http.get('/health').subscribe({ error: () => undefined });

    httpMock.expectOne('/health').error(new ProgressEvent('error'), { status: 0 });
    await flushMicrotasks();

    expect(reporting.report).not.toHaveBeenCalled();
  });

  describe('extractTraceId', () => {
    it('relit un ProblemDetails reçu en Blob (client NSwag)', async () => {
      const blob = new Blob([JSON.stringify({ traceId })], { type: 'application/problem+json' });

      expect(await extractTraceId(blob)).toBe(traceId);
    });

    it('renvoie null pour un corps illisible', async () => {
      expect(await extractTraceId(new Blob(['<html>']))).toBeNull();
      expect(await extractTraceId(null)).toBeNull();
    });
  });
});
