import type { MockedObject } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { httpErrorReportingInterceptor } from './http-error-reporting.interceptor';
import { ErrorReportingService } from '../errors/error-reporting.service';

describe('httpErrorReportingInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let reporting: MockedObject<ErrorReportingService>;
  const traceId = '0123456789abcdef0123456789abcdef';

  beforeEach(() => {
    reporting = {
      report: vi.fn().mockName('ErrorReportingService.report'),
      setLastErrorCode: vi.fn().mockName('ErrorReportingService.setLastErrorCode'),
    } as never;
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
    http.get('/api/daily/today').subscribe({ error: () => (propagated = true) });

    httpMock.expectOne('/api/daily/today').flush({ traceId }, { status: 500, statusText: 'Server Error' });
    await flushMicrotasks();

    expect(propagated).toBe(true);
    expect(reporting.setLastErrorCode).toHaveBeenCalledWith(traceId);
    expect(reporting.report).toHaveBeenCalledWith(expect.objectContaining({
      source: 'http', httpStatus: 500, relatedTraceId: traceId, url: '/api/daily/today',
    }));
  });

  it('remonte un échec réseau (status 0)', async () => {
    http.get('/api/daily/settings').subscribe({ error: () => undefined });

    httpMock.expectOne('/api/daily/settings').error(new ProgressEvent('error'), { status: 0 });
    await flushMicrotasks();

    expect(reporting.report).toHaveBeenCalledWith(expect.objectContaining({ source: 'http', httpStatus: 0 }));
  });

  it('ignore les réponses métier 4xx', async () => {
    http.post('/api/daily/sessions', {}).subscribe({ error: () => undefined });

    httpMock.expectOne('/api/daily/sessions').flush({ error: 'daily.already_played' }, { status: 409, statusText: 'Conflict' });
    await flushMicrotasks();

    expect(reporting.report).not.toHaveBeenCalled();
  });

  it('ignore le polling /health', async () => {
    http.get('/health').subscribe({ error: () => undefined });

    httpMock.expectOne('/health').error(new ProgressEvent('error'), { status: 0 });
    await flushMicrotasks();

    expect(reporting.report).not.toHaveBeenCalled();
  });

});
