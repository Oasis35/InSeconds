import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { HEALTH_KO_THRESHOLD, HEALTH_POLL_MS, HealthService } from './health.service';
import { environment } from '../../../environments/environment';

describe('HealthService', () => {
  const url = `${environment.apiUrl}/health`;
  let service: HealthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    vi.useFakeTimers();
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(HealthService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    vi.useRealTimers();
  });

  /** Fait passer une sonde : avance l'horloge jusqu'à la requête puis y répond. */
  async function probe(ok: boolean, first = false): Promise<void> {
    await vi.advanceTimersByTimeAsync(first ? 0 : HEALTH_POLL_MS);
    const req = httpMock.expectOne(url);
    if (ok) req.flush({ status: 'Healthy' });
    else req.error(new ProgressEvent('error'), { status: 0 });
  }

  it('ne sonde rien avant start()', async () => {
    await vi.advanceTimersByTimeAsync(HEALTH_POLL_MS * 2);

    httpMock.expectNone(url);
    expect(service.state()).toBe('loading');
  });

  it('passe à ok dès la première réponse', async () => {
    service.start();
    await probe(true, true);

    expect(service.state()).toBe('ok');
    expect(service.isDown()).toBe(false);
  });

  it(`ne déclare l'API KO qu'après ${HEALTH_KO_THRESHOLD} échecs consécutifs`, async () => {
    service.start();
    await probe(true, true);

    for (let i = 1; i < HEALTH_KO_THRESHOLD; i++) {
      await probe(false);
      expect(service.isDown()).toBe(false);
    }
    await probe(false);

    expect(service.isDown()).toBe(true);
  });

  it('remet le compteur à zéro à chaque succès', async () => {
    service.start();
    await probe(false, true);
    await probe(false);
    await probe(true);
    await probe(false);
    await probe(false);

    expect(service.isDown()).toBe(false);
  });

  it('fait disparaître l\'overlay dès que l\'API revient', async () => {
    service.start();
    await probe(false, true);
    await probe(false);
    await probe(false);
    expect(service.isDown()).toBe(true);

    await probe(true);

    expect(service.isDown()).toBe(false);
  });

  it('ne démarre qu\'une sonde même si start() est appelé deux fois', async () => {
    service.start();
    service.start();

    await probe(true, true);
    await probe(true);

    // Une seule requête par intervalle (expectOne échoue sur deux) ; verify() dans afterEach.
    expect(service.state()).toBe('ok');
  });
});
