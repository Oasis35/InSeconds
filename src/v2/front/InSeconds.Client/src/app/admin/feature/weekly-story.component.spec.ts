import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { problem } from '../data-access/testing/fake-catalogue-api';
import {
  FakeStoryRenderer, FakeWeeklyStoryApi, fakeStoryRenderer, fakeWeeklyStoryApi, provideStoryRendererFake,
  provideWeeklyStoryApiFake, weeklyRecap,
} from '../data-access/testing/fake-weekly-story-api';
import { WeeklyStoryStore } from '../data-access/weekly-story.store';
import { WeeklyStoryComponent } from './weekly-story.component';

describe('WeeklyStoryComponent', () => {
  let fixture: ComponentFixture<WeeklyStoryComponent>;
  let component: WeeklyStoryComponent;
  let api: FakeWeeklyStoryApi;
  let renderer: FakeStoryRenderer;
  let store: InstanceType<typeof WeeklyStoryStore>;

  function setup(apiOverrides: Partial<FakeWeeklyStoryApi> = {}, rendererOverrides: Partial<FakeStoryRenderer> = {}) {
    api = fakeWeeklyStoryApi(apiOverrides);
    renderer = fakeStoryRenderer(rendererOverrides);
    TestBed.configureTestingModule({
      imports: [WeeklyStoryComponent],
      providers: [provideTranslateService(), provideWeeklyStoryApiFake(api), provideStoryRendererFake(renderer)],
    });
    fixture = TestBed.createComponent(WeeklyStoryComponent);
    component = fixture.componentInstance;
    store = fixture.debugElement.injector.get(WeeklyStoryStore);
    fixture.detectChanges();
  }

  const el = () => fixture.nativeElement as HTMLElement;
  const stage = () => el().querySelector('[data-story-stage]') as HTMLElement | null;

  /** Coche ou décoche la case `index` (0 : repères, 1 : pourcentage) comme le ferait l'admin. */
  async function toggleCheckbox(index: number): Promise<void> {
    const checkbox = el().querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[index];
    checkbox.checked = !checkbox.checked;
    checkbox.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('génère une image par story, dans l\'ordre, avec le nom de fichier du dernier jour', async () => {
    setup();

    await component.generate();

    expect(renderer.capture).toHaveBeenCalledTimes(2);
    expect(store.status()).toBe('ready');
    expect(store.images().map(image => image.kind)).toEqual(['found', 'missed']);
    expect(store.images()[0].fileName).toBe('instagram-trouve-2026-09-27.png');
    expect(store.images()[0].dataUrl).toMatch(/^data:image\/png/);
    expect(renderer.prepare).toHaveBeenCalledTimes(1);
  });

  it('remplit les visuels avec le récap, sans pochette Deezer', async () => {
    setup();

    await component.generate();
    fixture.detectChanges();

    const found = el().querySelector('[data-story="found"]') as HTMLElement;
    expect(found.textContent).toContain('Daft Punk');
    expect(found.textContent).toContain('21 → 27 sept.');
    expect((el().querySelector('[data-story="missed"]') as HTMLElement).textContent).toContain('Stromae');
    expect(stage()?.querySelectorAll('img')).toHaveLength(0);
  });

  it('un seul morceau éligible : une seule story et un message', async () => {
    setup({ getRecap: vi.fn(async () => weeklyRecap({ mostMissed: null })) });

    await component.generate();
    fixture.detectChanges();

    expect(renderer.capture).toHaveBeenCalledTimes(1);
    expect(store.images().map(image => image.kind)).toEqual(['found']);
    expect(el().textContent).toContain('admin.actions.weeklyStory.onlyOne');
  });

  it('pas assez de réponses : aucune capture, message avec le seuil', async () => {
    setup({ getRecap: vi.fn(async () => weeklyRecap({ status: 'insufficient', mostFound: null, mostMissed: null })) });

    await component.generate();
    fixture.detectChanges();

    expect(renderer.capture).not.toHaveBeenCalled();
    expect(store.status()).toBe('insufficient');
    expect(el().textContent).toContain('admin.actions.weeklyStory.insufficient');
    expect(stage()).toBeNull();
  });

  it('échec de l\'API : aucune capture, message d\'erreur', async () => {
    setup({ getRecap: vi.fn(() => Promise.reject(problem(500, 'common.unexpected'))) });

    await component.generate();
    fixture.detectChanges();

    expect(renderer.capture).not.toHaveBeenCalled();
    expect(store.status()).toBe('error');
    expect(el().textContent).toContain('admin.actions.weeklyStory.error');
  });

  it('échec de la capture : statut « error »', async () => {
    setup({}, { capture: vi.fn(() => Promise.reject(new Error('canvas'))) });

    await component.generate();

    expect(store.status()).toBe('error');
  });

  it('masquer les repères retire les pointillés et recapture sans rappeler l\'API', async () => {
    setup();
    await component.generate();
    fixture.detectChanges();
    expect(el().querySelectorAll('.guide')).toHaveLength(2);
    renderer.capture.mockClear();

    await toggleCheckbox(0);

    expect(store.showGuides()).toBe(false);
    expect(el().querySelectorAll('.guide')).toHaveLength(0);
    expect(renderer.capture).toHaveBeenCalledTimes(2);
    expect(api.getRecap).toHaveBeenCalledTimes(1);
  });

  it('masquer le pourcentage retire le chiffre et sa légende, et recapture', async () => {
    setup();
    await component.generate();
    fixture.detectChanges();
    expect(el().querySelectorAll('.rate')).toHaveLength(2);
    renderer.capture.mockClear();

    await toggleCheckbox(1);

    expect(el().querySelectorAll('.rate, .caption')).toHaveLength(0);
    expect(renderer.capture).toHaveBeenCalledTimes(2);
  });

  it('changer le titre met à jour les visuels et recapture', async () => {
    setup();
    await component.generate();
    fixture.detectChanges();
    const titles = () => Array.from(el().querySelectorAll('[data-story] .title')).map(title => title.textContent?.trim());
    expect(titles()).toEqual(['Cette semaine dans InSeconds 🎧', 'Cette semaine dans InSeconds 🎧']);
    renderer.capture.mockClear();

    const select = el().querySelector('select') as HTMLSelectElement;
    select.value = 'lastWeek';
    select.dispatchEvent(new Event('change'));
    await fixture.whenStable();
    fixture.detectChanges();

    expect(titles()).toEqual(['La semaine dernière dans InSeconds 🎧', 'La semaine dernière dans InSeconds 🎧']);
    expect(renderer.capture).toHaveBeenCalledTimes(2);
    expect(api.getRecap).toHaveBeenCalledTimes(1);
  });

  it('période invalide : bouton désactivé, message, aucun appel', async () => {
    setup();
    store.setFrom('2026-09-10');
    store.setTo('2026-09-01');
    fixture.detectChanges();

    await component.generate();

    expect(api.getRecap).not.toHaveBeenCalled();
    expect(el().textContent).toContain('admin.actions.weeklyStory.invalidPeriod');
    expect((el().querySelector('[data-testid="weekly-story-generate"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('« Tout télécharger » propose chaque image sous son nom de fichier', async () => {
    setup();
    await component.generate();
    fixture.detectChanges();
    const names: string[] = [];
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      names.push(this.download);
    });

    const downloadAll = Array.from(el().querySelectorAll('button')).find(b => b.textContent?.includes('downloadAll'));
    downloadAll?.click();

    expect(names).toEqual(['instagram-trouve-2026-09-27.png', 'instagram-rate-2026-09-27.png']);
  });
});
