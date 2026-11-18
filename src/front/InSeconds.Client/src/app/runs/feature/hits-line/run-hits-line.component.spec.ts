import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { StoragePort } from '../../../core/storage/storage.port';
import { FakeSocialApi, provideFakeSocialApi } from '../../../social/data-access/testing/fake-social-api';
import { FakeRunsApi, provideFakeRunsApi } from '../../data-access/testing/fake-runs-api';
import { RunHitsLineComponent } from './run-hits-line.component';

describe('RunHitsLineComponent', () => {
  let api: FakeRunsApi;
  let saved: Map<string, string>;

  async function render() {
    const storage: StoragePort = { get: key => saved.get(key) ?? null, set: (key, value) => void saved.set(key, value), remove: key => void saved.delete(key) };
    TestBed.configureTestingModule({
      providers: [provideTranslateService(), provideRouter([]), provideFakeRunsApi(api), provideFakeSocialApi(new FakeSocialApi()), { provide: StoragePort, useValue: storage }],
    });
    const fixture = TestBed.createComponent(RunHitsLineComponent);
    fixture.detectChanges();
    await new Promise(resolve => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  beforeEach(() => {
    saved = new Map();
    api = new FakeRunsApi();
    api.hitsResult = [{ key: 'first_setlist', earned: true, progress: null, target: null }, { key: 'setlist_won', earned: false, progress: null, target: null }];
  });

  it('mène aux Hits avec le compte des obtenus', async () => {
    const el = await render();

    const line = el.querySelector('[data-testid="run-hits-line"]');
    expect(line?.getAttribute('href')).toBe('/setlist/hits');
    expect(el.querySelector('[data-testid="run-hits-count"]')?.textContent?.trim()).toBe('2 / 3');
    expect(el.querySelector('[data-testid="run-hits-fresh"]')).toBeNull();
  });

  it('dit combien de Hits viennent d\'être obtenus, sans les noter comme vus', async () => {
    saved.set('inseconds.hits.seen', JSON.stringify(['first_group']));
    const el = await render();

    expect(el.querySelector('[data-testid="run-hits-fresh"]')).not.toBeNull();
    expect(JSON.parse(saved.get('inseconds.hits.seen')!)).toEqual(['first_group']);
  });

  it('ne montre rien quand les Hits ne répondent pas', async () => {
    api.hitsResult = new Error('down');
    const el = await render();

    expect(el.querySelector('[data-testid="run-hits-line"]')).toBeNull();
  });
});
