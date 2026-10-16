import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { credentialsInterceptor } from './credentials.interceptor';
import { environment } from '../../../environments/environment';

describe('credentialsInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(withInterceptors([credentialsInterceptor])), provideHttpClientTesting()],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('envoie le cookie sur les appels à l\'API, admin compris', () => {
    for (const path of ['/api/players/me', '/api/admin/me']) {
      http.get(`${environment.apiUrl}${path}`).subscribe();
      expect(httpMock.expectOne(`${environment.apiUrl}${path}`).request.withCredentials).toBe(true);
    }
  });

  it('n\'envoie jamais le cookie vers une autre origine', () => {
    http.get('https://api.deezer.com/api/search?q=x').subscribe();

    expect(httpMock.expectOne('https://api.deezer.com/api/search?q=x').request.withCredentials).toBe(false);
  });

  it('n\'envoie pas le cookie sur les fichiers du front (traductions)', () => {
    http.get('i18n/fr.json').subscribe();

    expect(httpMock.expectOne('i18n/fr.json').request.withCredentials).toBe(false);
  });
});
