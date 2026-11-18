import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { FakeSocialApi, GENERAL, provideFakeSocialApi } from '../../data-access/testing/fake-social-api';
import { GeneralRankingComponent } from './general-ranking.component';

describe('GeneralRankingComponent', () => {
  let api: FakeSocialApi;

  async function render() {
    TestBed.configureTestingModule({ providers: [provideTranslateService(), provideFakeSocialApi(api)] });
    const fixture = TestBed.createComponent(GeneralRankingComponent);
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

  it('montre la tête, puis le joueur et ses voisins', async () => {
    const { el } = await render();

    const lists = el.querySelectorAll('[data-testid="ranking-list"]');
    expect(lists).toHaveLength(2);
    expect(lists[0].querySelectorAll('[data-testid="ranking-row"]')).toHaveLength(2);
    expect(lists[1].querySelector('[data-me="true"] [data-testid="ranking-rank"]')?.textContent).toBe('42');
  });

  it('ne montre qu\'une liste quand le joueur est dans la tête ou n\'est pas classé', async () => {
    api.general = { ...GENERAL, around: [] };
    const { el } = await render();

    expect(el.querySelectorAll('[data-testid="ranking-list"]')).toHaveLength(1);
  });

  it('dit quand personne n\'apparaît', async () => {
    api.general = { top: [], around: [], total: 0, hasAccount: true, identity: { mode: 'pseudo', name: 'Moi', alias: null } };
    const { el } = await render();

    expect(find(el, 'general-empty')).not.toBeNull();
  });

  it('propose de réessayer quand le classement ne répond pas', async () => {
    api.failGeneral = true;
    const { el, settle } = await render();
    expect(find(el, 'general-error')).not.toBeNull();

    api.failGeneral = false;
    find(el, 'general-error')!.querySelector('button')!.click();
    await settle();

    expect(find(el, 'general-ranking')).not.toBeNull();
  });
});
