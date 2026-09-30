import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { newVersionInterceptor } from './new-version.interceptor';
import { VersionService } from '../version/version.service';

describe('newVersionInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  const version = { markUpdateAvailable: vi.fn() };

  beforeEach(() => {
    version.markUpdateAvailable.mockClear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([newVersionInterceptor])),
        provideHttpClientTesting(),
        { provide: VersionService, useValue: version },
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  const flushMicrotasks = () => new Promise(resolve => setTimeout(resolve));

  it('propose de recharger quand une ancienne route répond 410 common.new_version, et re-propage l\'erreur', async () => {
    let propagated = false;
    http.get('/api/sessions/today').subscribe({ error: () => (propagated = true) });

    httpMock.expectOne('/api/sessions/today').flush({ code: 'common.new_version' }, { status: 410, statusText: 'Gone' });
    await flushMicrotasks();

    expect(propagated).toBe(true);
    expect(version.markUpdateAvailable).toHaveBeenCalledTimes(1);
  });

  it('ignore un 410 sans ce code', async () => {
    http.get('/api/x').subscribe({ error: () => undefined });

    httpMock.expectOne('/api/x').flush({ code: 'common.not_found' }, { status: 410, statusText: 'Gone' });
    await flushMicrotasks();

    expect(version.markUpdateAvailable).not.toHaveBeenCalled();
  });

  it('ignore les autres statuts', async () => {
    http.get('/api/x').subscribe({ error: () => undefined });

    httpMock.expectOne('/api/x').flush({ code: 'common.new_version' }, { status: 500, statusText: 'Server Error' });
    await flushMicrotasks();

    expect(version.markUpdateAvailable).not.toHaveBeenCalled();
  });
});
