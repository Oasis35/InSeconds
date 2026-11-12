import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { FakeAdminGroupsApi, adminGroup, fakeAdminGroupsApi, provideAdminGroupsApiFake } from '../../data-access/testing/fake-admin-groups-api';
import { problem } from '../../data-access/testing/fake-catalogue-api';
import { AdminGroup } from '../../domain/admin-group';
import { GroupsPage } from './groups.page';

describe('GroupsPage', () => {
  const copains = adminGroup({ id: 1 });
  const voisins = adminGroup({ id: 2, name: 'Les voisins', ownerPseudo: 'Bob' });

  let api: FakeAdminGroupsApi;

  async function render(options: { groups?: AdminGroup[]; api?: Partial<FakeAdminGroupsApi> } = {}) {
    api = fakeAdminGroupsApi({ list: vi.fn(async () => options.groups ?? [copains, voisins]), ...options.api });
    TestBed.configureTestingModule({ providers: [provideTranslateService(), provideAdminGroupsApiFake(api)] });
    const fixture = TestBed.createComponent(GroupsPage);
    const element = fixture.nativeElement as HTMLElement;
    const settle = async () => {
      await fixture.whenStable();
      await new Promise<void>(resolve => setTimeout(resolve, 0));
      fixture.detectChanges();
    };
    fixture.detectChanges();
    await settle();
    return { element, settle, rows: () => element.querySelectorAll('[data-testid="admin-group"]') };
  }

  it('charge la liste à l\'ouverture et montre une ligne par groupe', async () => {
    const { rows } = await render();
    expect(api.list).toHaveBeenCalledTimes(1);
    expect(rows()).toHaveLength(2);
    expect(rows()[0].textContent).toContain('Les copains');
  });

  it('affiche l\'état vide', async () => {
    expect((await render({ groups: [] })).element.textContent).toContain('admin.groups.empty');
  });

  it('affiche l\'erreur de chargement', async () => {
    const failed = await render({ api: { list: vi.fn(() => Promise.reject(problem(500, 'common.unexpected'))) } });
    expect(failed.element.querySelector('[role="alert"]')).not.toBeNull();
  });

  it('filtre par nom ou par créateur', async () => {
    const { element, settle, rows } = await render();
    const input = element.querySelector('#groups-filter-text') as HTMLInputElement;
    input.value = 'bob';
    input.dispatchEvent(new Event('input'));
    await settle();
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain('Les voisins');

    input.value = 'zzz';
    input.dispatchEvent(new Event('input'));
    await settle();
    expect(element.textContent).toContain('admin.groups.noMatch');
  });

  it('supprime un groupe après confirmation', async () => {
    const { element, settle, rows } = await render();
    (rows()[0].querySelector('[data-testid="delete-group"]') as HTMLElement).click();
    await settle();
    (element.querySelector('[data-testid="confirm-delete"]') as HTMLElement).click();
    await settle();
    expect(api.remove).toHaveBeenCalledWith(1);
    expect(rows()).toHaveLength(1);
  });

  it('renomme un groupe et montre le refus de l\'API sous la ligne', async () => {
    const { element, settle, rows } = await render({ api: { rename: vi.fn(() => Promise.reject(problem(400, 'social.invalid_name'))) } });
    (rows()[0].querySelector('[data-testid="rename-group"]') as HTMLElement).click();
    await settle();
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    await settle();
    expect(api.rename).toHaveBeenCalledWith(1, 'Les copains');
    expect(rows()[0].querySelector('[data-testid="group-error"]')).not.toBeNull();
  });

  it('remet un nom à zéro après confirmation', async () => {
    const { element, settle, rows } = await render();
    (rows()[1].querySelector('[data-testid="reset-group-name"]') as HTMLElement).click();
    await settle();
    (element.querySelector('[data-testid="confirm-reset"]') as HTMLElement).click();
    await settle();
    expect(api.resetName).toHaveBeenCalledWith(2);
    expect(rows()[1].textContent).toContain('Groupe 2');
  });
});
