import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { fakePlayersApi, providePlayersApiFake } from '../../../account/data-access/testing/fake-players-api';
import { StoragePort } from '../../../core/storage/storage.port';
import { FakeSocialApi, provideFakeSocialApi } from '../../../social/data-access/testing/fake-social-api';
import { FakeRunsApi, provideFakeRunsApi } from '../../data-access/testing/fake-runs-api';
import { RunHitsPage } from './run-hits.page';

describe('RunHitsPage', () => {
  let api: FakeRunsApi;
  let saved: Map<string, string>;

  async function render() {
    const storage: StoragePort = { get: key => saved.get(key) ?? null, set: (key, value) => void saved.set(key, value), remove: key => void saved.delete(key) };
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(), provideRouter([]), providePlayersApiFake(fakePlayersApi()), provideFakeRunsApi(api), provideFakeSocialApi(new FakeSocialApi()),
        { provide: StoragePort, useValue: storage },
      ],
    });
    const fixture = TestBed.createComponent(RunHitsPage);
    const settle = async () => {
      fixture.detectChanges();
      await new Promise(resolve => setTimeout(resolve));
      await fixture.whenStable();
      fixture.detectChanges();
    };
    await settle();
    return { el: fixture.nativeElement as HTMLElement, settle };
  }

  const find = (el: HTMLElement, id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);

  beforeEach(() => {
    saved = new Map();
    api = new FakeRunsApi();
    api.hitsResult = [
      { key: 'first_setlist', earned: true, progress: null, target: null },
      { key: 'first_risky_round', earned: false, progress: null, target: null },
      { key: 'ten_setlists', earned: false, progress: 7, target: 10 },
      { key: 'five_duels', earned: true, progress: 5, target: 5 },
    ];
  });

  it('liste les Hits, compte les obtenus et montre où en sont ceux qui se comptent', async () => {
    const { el } = await render();

    expect(find(el, 'hits-count')?.textContent?.trim()).toBe('3 / 5');
    const rows = [...el.querySelectorAll<HTMLElement>('[data-testid="hit"]')];
    expect(rows.map(row => [row.dataset['hit'], row.dataset['earned']])).toEqual([
      ['first_setlist', 'true'], ['first_risky_round', 'false'], ['first_group', 'true'], ['ten_setlists', 'false'], ['five_duels', 'true'],
    ]);
    // La barre et « 7 / 10 » seulement tant que le Hit reste à obtenir.
    expect([...el.querySelectorAll('[data-testid="hit-progress"]')].map(p => p.textContent?.trim())).toEqual(['7 / 10']);
    expect(find(el, 'hits-back')?.getAttribute('href')).toBe('/setlist');
  });

  it('fête un Hit obtenu depuis la dernière visite, une seule fois', async () => {
    saved.set('inseconds.hits.seen', JSON.stringify(['first_setlist', 'first_group']));
    const { el } = await render();

    expect([...el.querySelectorAll<HTMLElement>('[data-fresh="true"]')].map(row => row.dataset['hit'])).toEqual(['five_duels']);
    expect(JSON.parse(saved.get('inseconds.hits.seen')!)).toContain('five_duels');
  });

  it('dit quoi faire sans aucun Hit à montrer, et propose de réessayer sur une erreur', async () => {
    api.hitsResult = [];
    const first = await render();
    expect(find(first.el, 'hits-empty')).not.toBeNull();
    TestBed.resetTestingModule();

    api.hitsResult = new Error('down');
    const { el, settle } = await render();
    expect(find(el, 'hits-list')).toBeNull();
    api.hitsResult = [{ key: 'first_setlist', earned: true, progress: null, target: null }];
    el.querySelector<HTMLButtonElement>('[data-testid="run-retry"], button')!.click();
    await settle();
    expect(find(el, 'hits-list')).not.toBeNull();
  });
});
