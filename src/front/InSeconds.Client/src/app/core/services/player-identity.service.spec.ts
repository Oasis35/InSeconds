import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';
import { PlayerIdentityService } from './player-identity.service';
import { environment } from '../../../environments/environment';

describe('PlayerIdentityService', () => {
  let service: PlayerIdentityService;
  let httpMock: HttpTestingController;
  const meUrl = `${environment.apiUrl}/api/players/me`;
  const fakeId = 'aaaaaaaa-0000-0000-0000-000000000001';

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        PlayerIdentityService,
        provideHttpClient(),
        provideHttpClientTesting(),
      ],
    });
    // L'appel GET part dans le constructeur — inject() ici déclenche déjà la requête.
    service = TestBed.inject(PlayerIdentityService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  it('should have a null playerId before the response resolves', () => {
    expect(service.playerId()).toBeNull();
    httpMock.expectOne(meUrl).flush({ playerId: fakeId });
  });

  it('should GET /api/players/me exactly once on construction', () => {
    const req = httpMock.expectOne(meUrl);
    expect(req.request.method).toBe('GET');
    req.flush({ playerId: fakeId });
  });

  it('should update the playerId signal after a successful response', () => {
    httpMock.expectOne(meUrl).flush({ playerId: fakeId });

    expect(service.playerId()).toBe(fakeId);
  });

  it('should swallow HTTP errors and keep playerId null', () => {
    httpMock.expectOne(meUrl).flush('error', { status: 500, statusText: 'Server Error' });

    expect(service.playerId()).toBeNull();
  });
});
