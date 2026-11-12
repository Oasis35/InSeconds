import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, Router, convertToParamMap, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { PendingInvite } from '../../data-access/pending-invite';
import { FakeSocialApi, INVITATION, provideFakeSocialApi } from '../../data-access/testing/fake-social-api';
import { signIn } from '../testing/session';
import { JoinGroupPage } from './join-group.page';

describe('JoinGroupPage', () => {
  let api: FakeSocialApi;
  let navigate: ReturnType<typeof vi.spyOn>;

  async function render(options: { code?: string; who?: 'account' | 'guest' | 'nobody'; setup?: (api: FakeSocialApi) => void } = {}) {
    api = new FakeSocialApi();
    options.setup?.(api);
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(), provideRouter([]), provideFakeSocialApi(api),
        { provide: ActivatedRoute, useValue: { snapshot: { paramMap: convertToParamMap({ code: options.code ?? 'ABCD2345' }) } } },
      ],
    });
    TestBed.inject(PendingInvite).clear();
    signIn(options.who ?? 'account');
    navigate = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    const fixture = TestBed.createComponent(JoinGroupPage);
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

  afterEach(() => TestBed.inject(PendingInvite).clear());

  it('montre le nom du groupe et ses places, puis « Rejoindre » ouvre son classement', async () => {
    const { el, settle } = await render();
    expect(find(el, 'join-name')?.textContent).toBe('Potes');

    find(el, 'join-submit')!.click();
    await settle();

    expect(api.calls).toEqual(['invitation:ABCD2345', 'join:ABCD2345']);
    expect(navigate).toHaveBeenCalledWith(['/ranking'], { queryParams: { group: 4 }, replaceUrl: true });
    expect(TestBed.inject(PendingInvite).get()).toBeNull();
  });

  it('sans compte : l\'invitation est gardée et mène à la connexion', async () => {
    const { el } = await render({ who: 'guest' });

    expect(find(el, 'join-submit')).toBeNull();
    expect(find(el, 'join-login')?.getAttribute('href')).toBe('/account/login');
    expect(TestBed.inject(PendingInvite).get()).toBe('ABCD2345');
  });

  it('déjà membre : le classement, sans « Rejoindre »', async () => {
    const { el } = await render({ setup: fake => (fake.invitationOutcome = { kind: 'ok', invitation: { ...INVITATION, alreadyMember: true } }) });

    expect(find(el, 'join-already')).not.toBeNull();
    expect(find(el, 'join-submit')).toBeNull();
    expect(TestBed.inject(PendingInvite).get()).toBeNull();
  });

  it('groupe complet : on le dit, sans « Rejoindre »', async () => {
    const { el } = await render({ setup: fake => (fake.invitationOutcome = { kind: 'ok', invitation: { ...INVITATION, isFull: true } }) });

    expect(find(el, 'join-full')).not.toBeNull();
    expect(find(el, 'join-submit')).toBeNull();
  });

  it('un lien mal écrit ou inconnu : invitation introuvable', async () => {
    expect(find((await render({ code: 'nope' })).el, 'join-not-found')).not.toBeNull();
    expect(api.calls).toEqual([]);

    TestBed.resetTestingModule();
    expect(find((await render({ setup: fake => (fake.invitationOutcome = { kind: 'invitation_not_found' }) })).el, 'join-not-found')).not.toBeNull();
  });

  it('un refus à l\'adhésion (complet entre-temps) s\'affiche', async () => {
    const { el, settle } = await render({ setup: fake => (fake.joinOutcome = { kind: 'group_full' }) });

    find(el, 'join-submit')!.click();
    await settle();

    expect(find(el, 'join-error-message')?.textContent?.trim()).toBe('social.join.full');
    expect(navigate).not.toHaveBeenCalled();
  });
});
