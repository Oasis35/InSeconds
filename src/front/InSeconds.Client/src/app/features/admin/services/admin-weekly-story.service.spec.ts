import { TestBed } from '@angular/core/testing';
import { of, throwError } from 'rxjs';
import { AdminWeeklyStoryService } from './admin-weekly-story.service';
import { AdminHttpService } from './admin-http.service';
import { WeeklyRecapResponse } from '../admin.models';

const track = { artist: 'Daft Punk', title: 'One More Time', coverUrl: null, successRatePercent: 87, answers: 23 };
const okRecap: WeeklyRecapResponse = {
  status: 'ok', from: '2026-09-21', to: '2026-09-27', minAnswers: 3, mostFound: track, mostMissed: { ...track, successRatePercent: 8 },
};

describe('AdminWeeklyStoryService', () => {
  let service: AdminWeeklyStoryService;
  let http: { getWeeklyRecap: jasmine.Spy };

  beforeEach(() => {
    http = { getWeeklyRecap: jasmine.createSpy('getWeeklyRecap') };
    TestBed.configureTestingModule({
      providers: [AdminWeeklyStoryService, { provide: AdminHttpService, useValue: http }],
    });
    service = TestBed.inject(AdminWeeklyStoryService);
  });

  it('load() : récap exploitable → true, statut rendering', async () => {
    http.getWeeklyRecap.and.returnValue(of(okRecap));

    expect(await service.load()).toBeTrue();
    expect(service.status()).toBe('rendering');
    expect(service.recap()).toEqual(okRecap);
    expect(service.busy()).toBeTrue();
  });

  it('load() : insufficient_data → false, statut insufficient', async () => {
    http.getWeeklyRecap.and.returnValue(of({ ...okRecap, status: 'insufficient_data', mostFound: null, mostMissed: null }));

    expect(await service.load()).toBeFalse();
    expect(service.status()).toBe('insufficient');
    expect(service.busy()).toBeFalse();
  });

  it('load() : erreur HTTP → false, statut error, récap vidé', async () => {
    service.recap.set(okRecap);
    http.getWeeklyRecap.and.returnValue(throwError(() => new Error('500')));

    expect(await service.load()).toBeFalse();
    expect(service.status()).toBe('error');
    expect(service.recap()).toBeNull();
  });

  it('load() efface les images précédentes', async () => {
    service.setImages([{ kind: 'found', dataUrl: 'data:x', fileName: 'a.png' }]);
    http.getWeeklyRecap.and.returnValue(of(okRecap));

    await service.load();

    expect(service.images()).toEqual([]);
  });

  it('setImages() → statut ready', () => {
    const images = [{ kind: 'found' as const, dataUrl: 'data:x', fileName: 'a.png' }];
    service.setImages(images);

    expect(service.status()).toBe('ready');
    expect(service.images()).toEqual(images);
  });
});
