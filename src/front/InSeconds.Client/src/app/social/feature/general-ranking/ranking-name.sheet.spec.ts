import { DialogRef } from '@angular/cdk/dialog';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { GeneralRankingStore } from '../../data-access/general-ranking.store';
import { FakeSocialApi, provideFakeSocialApi } from '../../data-access/testing/fake-social-api';
import { RankingNameSheet } from './ranking-name.sheet';

describe('RankingNameSheet', () => {
  let api: FakeSocialApi;
  let close: ReturnType<typeof vi.fn>;

  async function render() {
    close = vi.fn();
    TestBed.configureTestingModule({
      providers: [provideTranslateService(), provideFakeSocialApi(api), GeneralRankingStore, { provide: DialogRef, useValue: { close } }],
    });
    await TestBed.inject(GeneralRankingStore).load();
    const fixture = TestBed.createComponent(RankingNameSheet);
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

  beforeEach(() => (api = new FakeSocialApi()));

  it('part du pseudo, coché par défaut', async () => {
    const { el } = await render();

    expect(find(el, 'name-pseudo')?.getAttribute('aria-checked')).toBe('true');
    expect(find(el, 'name-alias')?.getAttribute('aria-checked')).toBe('false');
    expect(find(el, 'name-alias-value')).toBeNull();
  });

  it('choisir l\'alias le tire tout de suite et le montre, « Autre alias » en donne un autre', async () => {
    const { el, settle } = await render();

    find(el, 'name-alias')!.click();
    await settle();
    expect(api.calls).toContain('identity:alias');
    const first = find(el, 'name-alias-value')?.textContent?.trim();
    expect(first).toMatch(/^Hibou rêveur \d+$/);

    find(el, 'name-other-alias')!.click();
    await settle();
    expect(api.calls).toContain('alias');
    expect(find(el, 'name-alias-value')?.textContent?.trim()).not.toBe(first);
  });

  it('revenir au pseudo puis « Enregistrer » rend l\'alias et ferme la feuille', async () => {
    api.general = { ...api.general, identity: { mode: 'alias', name: 'Hibou rêveur 12', alias: 'Hibou rêveur 12' } };
    const { el, settle } = await render();
    expect(find(el, 'name-alias')?.getAttribute('aria-checked')).toBe('true');

    find(el, 'name-pseudo')!.click();
    await settle();
    find(el, 'name-save')!.click();
    await settle();

    expect(api.calls).toContain('identity:pseudo');
    expect(close).toHaveBeenCalled();
  });

  it('un échec le dit et garde la feuille ouverte', async () => {
    api.general = { ...api.general, identity: { mode: 'alias', name: 'Hibou rêveur 12', alias: 'Hibou rêveur 12' } };
    const { el, settle } = await render();
    api.failIdentity = true;

    find(el, 'name-pseudo')!.click();
    await settle();
    find(el, 'name-save')!.click();
    await settle();

    expect(find(el, 'name-save-failed')).not.toBeNull();
    expect(close).not.toHaveBeenCalled();
  });
});
