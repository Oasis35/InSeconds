import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { GroupsStore } from '../../data-access/groups.store';
import { PendingInvite } from '../../data-access/pending-invite';
import { FakeSocialApi, provideFakeSocialApi } from '../../data-access/testing/fake-social-api';
import { GroupsStripComponent } from './groups-strip.component';

describe('GroupsStripComponent', () => {
  let api: FakeSocialApi;

  async function render(showGroups: boolean, pending: string | null = null, setup?: (api: FakeSocialApi) => void) {
    api = new FakeSocialApi();
    setup?.(api);
    TestBed.configureTestingModule({ providers: [provideTranslateService(), provideRouter([]), provideFakeSocialApi(api), GroupsStore] });
    const invite = TestBed.inject(PendingInvite);
    invite.clear();
    if (pending) invite.set(pending);
    const fixture = TestBed.createComponent(GroupsStripComponent);
    fixture.componentRef.setInput('showGroups', showGroups);
    fixture.detectChanges();
    await new Promise(resolve => setTimeout(resolve));
    await fixture.whenStable();
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  afterEach(() => TestBed.inject(PendingInvite).clear());

  it('une ligne par groupe, avec ma place, qui ouvre son classement', async () => {
    const el = await render(true);

    const rows = [...el.querySelectorAll('[data-testid="strip-group"]')];
    expect(rows.map(row => row.getAttribute('href'))).toEqual(['/ranking?group=4', '/ranking?group=7']);
    expect(rows[0].textContent).toContain('Potes');
    expect(rows[0].textContent).toContain('social.strip.rank');
  });

  it('sans groupe : « Joue avec tes amis · Créer un groupe »', async () => {
    const el = await render(true, null, fake => (fake.groups = { groups: [], maxGroups: 5 }));

    expect(el.querySelector('[data-testid="strip-create"]')?.getAttribute('href')).toBe('/ranking/new');
  });

  it('une invitation reçue avec le lien de la playlist est proposée à tout joueur, sans lire de groupes', async () => {
    const el = await render(false, 'ABCD2345');

    expect(el.querySelector('[data-testid="strip-pending"]')?.getAttribute('href')).toBe('/ranking/join/ABCD2345');
    expect(api.calls).toEqual([]);
  });

  it('rien pour qui n\'a ni groupes à montrer ni invitation', async () => {
    const el = await render(false);

    expect(el.querySelector('[data-testid="groups-strip"]')).toBeNull();
    expect(api.calls).toEqual([]);
  });
});
