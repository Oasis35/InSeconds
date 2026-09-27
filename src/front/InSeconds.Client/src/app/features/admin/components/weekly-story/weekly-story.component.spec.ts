import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { of, throwError } from 'rxjs';
import { WeeklyStoryComponent } from './weekly-story.component';
import { AdminWeeklyStoryService } from '../../services/admin-weekly-story.service';
import { AdminHttpService } from '../../services/admin-http.service';
import { WeeklyRecapResponse } from '../../admin.models';

const track = { artist: 'Daft Punk', title: 'One More Time', coverUrl: null, successRatePercent: 87, answers: 23 };
const okRecap: WeeklyRecapResponse = {
  status: 'ok', from: '2026-09-21', to: '2026-09-27', minAnswers: 3,
  mostFound: track, mostMissed: { ...track, artist: 'Stromae', successRatePercent: 8 },
};

// html2canvas n'est jamais chargé : la capture est remplacée par un faux canvas.
describe('WeeklyStoryComponent', () => {
  let fixture: ComponentFixture<WeeklyStoryComponent>;
  let component: WeeklyStoryComponent;
  let story: AdminWeeklyStoryService;
  let http: { getWeeklyRecap: jasmine.Spy };
  let capture: jasmine.Spy;

  beforeEach(() => {
    http = { getWeeklyRecap: jasmine.createSpy('getWeeklyRecap') };
    TestBed.configureTestingModule({
      imports: [WeeklyStoryComponent],
      providers: [
        provideTranslateService(),
        AdminWeeklyStoryService,
        { provide: AdminHttpService, useValue: http },
      ],
    });
    fixture = TestBed.createComponent(WeeklyStoryComponent);
    component = fixture.componentInstance;
    story = TestBed.inject(AdminWeeklyStoryService);
    capture = jasmine.createSpy('capture').and.callFake(() => {
      const canvas = document.createElement('canvas');
      canvas.width = 1080;
      canvas.height = 1920;
      return Promise.resolve(canvas);
    });
    component.captureFn = capture;
    fixture.detectChanges();
  });

  it('génère une image par story, dans l\'ordre, au format 1080×1920', async () => {
    http.getWeeklyRecap.and.returnValue(of(okRecap));

    await component.generate();

    expect(capture).toHaveBeenCalledTimes(2);
    const [, options] = capture.calls.first().args;
    expect(options.width).toBe(1080);
    expect(options.height).toBe(1920);
    expect(story.status()).toBe('ready');
    expect(story.images().map(i => i.kind)).toEqual(['found', 'missed']);
    expect(story.images()[0].fileName).toBe('instagram-trouve-2026-09-27.png');
    expect(story.images()[0].dataUrl).toMatch(/^data:image\/png/);
  });

  it('remplit les gabarits avec le récap', async () => {
    http.getWeeklyRecap.and.returnValue(of(okRecap));

    await component.generate();

    const found = fixture.nativeElement.querySelector('[data-story="found"]') as HTMLElement;
    expect(found.textContent).toContain('Daft Punk');
    expect(found.textContent).toContain('87');
    expect(found.textContent).toContain('21 → 27 sept.');
    expect(fixture.nativeElement.querySelector('[data-story="missed"]').textContent).toContain('Stromae');
    // L'adresse du site n'est pas écrite : elle passe par le sticker « lien » d'Instagram.
    expect(found.textContent).not.toContain('inseconds.cc');
  });

  it('un seul morceau éligible : une seule story', async () => {
    http.getWeeklyRecap.and.returnValue(of({ ...okRecap, mostMissed: null }));

    await component.generate();

    expect(capture).toHaveBeenCalledTimes(1);
    expect(story.images().map(i => i.kind)).toEqual(['found']);
  });

  it('pas assez de réponses : aucune capture', async () => {
    http.getWeeklyRecap.and.returnValue(of({ ...okRecap, status: 'insufficient_data', mostFound: null, mostMissed: null }));

    await component.generate();

    expect(capture).not.toHaveBeenCalled();
    expect(story.status()).toBe('insufficient');
  });

  it('erreur API : aucune capture, statut error', async () => {
    http.getWeeklyRecap.and.returnValue(throwError(() => new Error('500')));

    await component.generate();

    expect(capture).not.toHaveBeenCalled();
    expect(story.status()).toBe('error');
  });

  it('échec de capture : statut error', async () => {
    http.getWeeklyRecap.and.returnValue(of(okRecap));
    capture.and.returnValue(Promise.reject(new Error('canvas')));

    await component.generate();

    expect(story.status()).toBe('error');
  });

  it('masquer les repères retire les pointillés et relance la capture', async () => {
    http.getWeeklyRecap.and.returnValue(of(okRecap));
    await component.generate();
    expect(fixture.nativeElement.querySelectorAll('.guide')).toHaveSize(2);
    expect(fixture.nativeElement.querySelectorAll('.guide-link')).toHaveSize(2);
    capture.calls.reset();

    component.toggleGuides(false);
    await fixture.whenStable();

    expect(story.showGuides()).toBeFalse();
    expect(fixture.nativeElement.querySelectorAll('.guide')).toHaveSize(0);
    expect(fixture.nativeElement.querySelectorAll('.guide-link')).toHaveSize(0);
    expect(capture).toHaveBeenCalledTimes(2);
    expect(http.getWeeklyRecap).toHaveBeenCalledTimes(1);
  });

  it('masquer le pourcentage retire le chiffre et sa légende et relance la capture', async () => {
    http.getWeeklyRecap.and.returnValue(of(okRecap));
    await component.generate();
    expect(fixture.nativeElement.querySelectorAll('.rate')).toHaveSize(2);
    expect(fixture.nativeElement.textContent).not.toContain('réponses');
    capture.calls.reset();

    component.togglePercent(false);
    await fixture.whenStable();

    expect(story.showPercent()).toBeFalse();
    expect(fixture.nativeElement.querySelectorAll('.rate')).toHaveSize(0);
    expect(fixture.nativeElement.querySelectorAll('.caption')).toHaveSize(0);
    expect(capture).toHaveBeenCalledTimes(2);
    expect(http.getWeeklyRecap).toHaveBeenCalledTimes(1);
  });

  it('changer le titre met à jour les gabarits et relance la capture', async () => {
    http.getWeeklyRecap.and.returnValue(of(okRecap));
    await component.generate();
    const titles = () => Array.from(fixture.nativeElement.querySelectorAll('.story .title') as NodeListOf<Element>).map(e => e.textContent?.trim());
    expect(titles()).toEqual(['Cette semaine dans InSeconds 🎧', 'Cette semaine dans InSeconds 🎧']);
    capture.calls.reset();

    component.setTitleMode('lastWeek');
    await fixture.whenStable();
    expect(titles()).toEqual(['La semaine dernière dans InSeconds 🎧', 'La semaine dernière dans InSeconds 🎧']);
    expect(capture).toHaveBeenCalledTimes(2);

    component.setTitleMode('custom');
    component.setCustomTitle('Best of de septembre');
    await fixture.whenStable();
    expect(titles()).toEqual(['Best of de septembre', 'Best of de septembre']);
    expect(http.getWeeklyRecap).toHaveBeenCalledTimes(1);
  });

  it('période invalide : pas d\'appel API', async () => {
    story.from.set('2026-09-10');
    story.to.set('2026-09-01');

    await component.generate();

    expect(http.getWeeklyRecap).not.toHaveBeenCalled();
  });
});
