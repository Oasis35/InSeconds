import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ErrorReportingService } from './error-reporting.service';
import { environment } from '../../../environments/environment';

describe('ErrorReportingService', () => {
  let service: ErrorReportingService;
  let httpMock: HttpTestingController;
  const endpoint = `${environment.apiUrl}/api/client-errors`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(ErrorReportingService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('envoie une exception JS avec son message, sa stack et le cookie joueur', () => {
    const error = new TypeError('x is undefined');

    service.reportError(error);

    const req = httpMock.expectOne(endpoint);
    expect(req.request.method).toBe('POST');
    expect(req.request.withCredentials).toBeTrue();
    expect(req.request.body.source).toBe('js');
    expect(req.request.body.message).toBe('TypeError: x is undefined');
    expect(req.request.body.stack).toBe(error.stack);
    req.flush(null, { status: 204, statusText: 'No Content' });
  });

  it('accepte une erreur qui n\'est pas une Error', () => {
    service.reportError('chaîne levée');

    expect(httpMock.expectOne(endpoint).request.body.message).toBe('chaîne levée');
  });

  it('ne transmet jamais la query string (token de magic link, recherche tapée)', () => {
    service.report({ source: 'http', message: 'GET /api/deezer/search → 500', url: 'https://api.inseconds.cc/api/deezer/search?q=daft%20punk' });

    expect(httpMock.expectOne(endpoint).request.body.url).toBe('https://api.inseconds.cc/api/deezer/search');
  });

  it('tronque les champs aux bornes du validator back', () => {
    service.report({ source: 'js', message: 'm'.repeat(2000), stack: 's'.repeat(9000) });

    const body = httpMock.expectOne(endpoint).request.body;
    expect(body.message).toHaveSize(1000);
    expect(body.stack).toHaveSize(8000);
  });

  it('n\'envoie pas deux fois la même erreur', () => {
    service.report({ source: 'js', message: 'boom' });
    service.report({ source: 'js', message: 'boom' });

    expect(httpMock.match(endpoint)).toHaveSize(1);
  });

  it('plafonne le nombre d\'envois par page', () => {
    for (let i = 0; i < ErrorReportingService.MAX_REPORTS_PER_PAGE + 5; i++) {
      service.report({ source: 'js', message: `boom ${i}` });
    }

    expect(httpMock.match(endpoint)).toHaveSize(ErrorReportingService.MAX_REPORTS_PER_PAGE);
  });

  it('avale un échec d\'envoi sans lever d\'erreur', () => {
    service.report({ source: 'js', message: 'boom' });

    expect(() => httpMock.expectOne(endpoint).error(new ProgressEvent('error'))).not.toThrow();
  });
});
