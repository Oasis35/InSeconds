import type { Mock } from 'vitest';
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
  let http: {
    getWeeklyRecap: Mock;
  };

  beforeEach(() => {
    http = { getWeeklyRecap: vi.fn().mockName('getWeeklyRecap') };
    TestBed.configureTestingModule({
      providers: [AdminWeeklyStoryService, { provide: AdminHttpService, useValue: http }],
    });
    service = TestBed.inject(AdminWeeklyStoryService);
  });

  it('load() : récap exploitable → true, statut rendering', async () => {
    http.getWeeklyRecap.mockReturnValue(of(okRecap));

    expect(await service.load()).toBe(true);
    expect(service.status()).toBe('rendering');
    expect(service.recap()).toEqual(okRecap);
    expect(service.busy()).toBe(true);
  });

  it('load() : insufficient_data → false, statut insufficient', async () => {
    http.getWeeklyRecap.mockReturnValue(of({ ...okRecap, status: 'insufficient_data', mostFound: null, mostMissed: null }));

    expect(await service.load()).toBe(false);
    expect(service.status()).toBe('insufficient');
    expect(service.busy()).toBe(false);
  });

  it('load() : erreur HTTP → false, statut error, récap vidé', async () => {
    service['_recap'].set(okRecap);
    http.getWeeklyRecap.mockReturnValue(throwError(() => new Error('500')));

    expect(await service.load()).toBe(false);
    expect(service.status()).toBe('error');
    expect(service.recap()).toBeNull();
  });

  it('load() efface les images précédentes', async () => {
    service.setImages([{ kind: 'found', dataUrl: 'data:x', fileName: 'a.png' }]);
    http.getWeeklyRecap.mockReturnValue(of(okRecap));

    await service.load();

    expect(service.images()).toEqual([]);
  });

  it('setImages() → statut ready', () => {
    const images = [{ kind: 'found' as const, dataUrl: 'data:x', fileName: 'a.png' }];
    service.setImages(images);

    expect(service.status()).toBe('ready');
    expect(service.images()).toEqual(images);
  });

  it('load() transmet la période choisie à l\'API', async () => {
    http.getWeeklyRecap.mockReturnValue(of(okRecap));
    service['_from'].set('2026-09-01');
    service['_to'].set('2026-09-10');

    await service.load();

    expect(http.getWeeklyRecap).toHaveBeenCalledWith('2026-09-01', '2026-09-10');
  });

  it('période par défaut : 7 jours, fin incluse', () => {
    const days = (Date.parse(service.to()) - Date.parse(service.from())) / 86400000;
    expect(days).toBe(6);
    expect(service.periodValid()).toBe(true);
  });

  it('periodValid() : faux si le début est après la fin', () => {
    service['_from'].set('2026-09-10');
    service['_to'].set('2026-09-01');
    expect(service.periodValid()).toBe(false);
  });

  it('storyTitle() : titres prédéfinis et texte libre', () => {
    expect(service.storyTitle()).toBe('Cette semaine dans InSeconds 🎧');
    service['_titleMode'].set('lastWeek');
    expect(service.storyTitle()).toBe('La semaine dernière dans InSeconds 🎧');
    service['_titleMode'].set('custom');
    service['_customTitle'].set('  Spécial été ☀️  ');
    expect(service.storyTitle()).toBe('Spécial été ☀️');
  });
});
