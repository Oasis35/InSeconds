import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { ShareService } from '../../../core/share/share.service';
import { ModalService } from '../../../ui/modal/modal.service';
import { PendingInvite } from '../../data-access/pending-invite';
import { FakeSocialApi, provideFakeSocialApi } from '../../data-access/testing/fake-social-api';
import { signIn } from '../testing/session';
import { RankingPage } from './ranking.page';

describe('RankingPage', () => {
  let api: FakeSocialApi;
  let shared: string[];
  let confirm: boolean;

  async function render(url = '/ranking', who: 'account' | 'guest' | 'nobody' = 'account', pending: string | null = null) {
    api ??= new FakeSocialApi();
    shared = [];
    TestBed.configureTestingModule({
      providers: [
        provideTranslateService(), provideRouter([{ path: 'ranking', component: RankingPage }, { path: '**', children: [] }]), provideFakeSocialApi(api),
        { provide: ShareService, useValue: { share: (text: string) => { shared.push(text); return Promise.resolve('copied'); } } },
        { provide: ModalService, useValue: { confirm: () => Promise.resolve(confirm) } },
      ],
    });
    const invite = TestBed.inject(PendingInvite);
    invite.clear();
    if (pending) invite.set(pending);
    signIn(who);
    await TestBed.inject(Router).navigateByUrl(url);
    const fixture = TestBed.createComponent(RankingPage);
    const settle = async () => {
      fixture.detectChanges();
      await new Promise(resolve => setTimeout(resolve));
      await fixture.whenStable();
      fixture.detectChanges();
    };
    await settle();
    return { fixture, el: fixture.nativeElement as HTMLElement, settle };
  }

  const find = (el: HTMLElement, id: string) => el.querySelector<HTMLElement>(`[data-testid="${id}"]`);

  beforeEach(() => {
    api = new FakeSocialApi();
    confirm = true;
  });
  afterEach(() => TestBed.inject(PendingInvite).clear());

  it('ouvre le classement général par sa pastille, même sans groupe', async () => {
    api.groups = { groups: [], maxGroups: 5 };
    const { el } = await render('/ranking?view=general');

    expect(find(el, 'ranking-general')?.getAttribute('aria-current')).toBe('page');
    expect(find(el, 'ranking-general')?.getAttribute('href')).toBe('/ranking?view=general');
    expect(find(el, 'general-ranking')).not.toBeNull();
    expect(find(el, 'ranking-empty')).toBeNull();
  });

  it('garde la pastille « Général » éteinte sur le classement d\'un groupe', async () => {
    const { el } = await render();

    expect(find(el, 'ranking-general')?.getAttribute('aria-current')).toBeNull();
    expect(find(el, 'general-ranking')).toBeNull();
  });

  it('montre mes groupes en pastilles et le classement du premier', async () => {
    const { el } = await render();

    const chips = [...el.querySelectorAll('[data-testid="ranking-group"]')];
    expect(chips.map(chip => chip.textContent?.trim())).toEqual(['Potes', 'Famille']);
    expect(chips[0].getAttribute('aria-current')).toBe('page');
    expect(chips[1].getAttribute('href')).toBe('/ranking?group=7');
    expect(find(el, 'ranking-new')?.getAttribute('href')).toBe('/ranking/new');
    expect(el.querySelectorAll('[data-testid="ranking-row"]')).toHaveLength(3);
  });

  it('ouvre le groupe de l\'adresse', async () => {
    const { el } = await render('/ranking?group=7');

    expect(api.calls).toEqual(['myGroups', 'ranking:7']);
    expect(el.querySelectorAll('[data-testid="ranking-row"]')).toHaveLength(1);
  });

  it('à la limite de groupes, « + Groupe » disparaît', async () => {
    api.groups = { ...api.groups, maxGroups: 2 };

    const { el } = await render();

    expect(find(el, 'ranking-new')).toBeNull();
  });

  it('« Inviter un ami » partage le lien du groupe et le dit', async () => {
    const { el, settle } = await render();

    find(el, 'ranking-invite')!.click();
    await settle();

    expect(shared).toHaveLength(1);
    expect(shared[0]).toContain('/ranking/join/ABCD2345?utm_source=share');
    expect(find(el, 'ranking-invite')?.textContent).toContain('social.invite.copied');
  });

  it('quitter un groupe demande confirmation, puis relit la liste', async () => {
    const { el, settle } = await render();
    confirm = false;
    find(el, 'ranking-leave')!.click();
    await settle();
    expect(api.calls).not.toContain('leave:4');

    confirm = true;
    find(el, 'ranking-leave')!.click();
    await settle();
    expect(api.calls).toContain('leave:4');
    expect([...el.querySelectorAll('[data-testid="ranking-group"]')].map(chip => chip.textContent?.trim())).toEqual(['Famille']);
  });

  it('sans groupe : « Joue contre tes amis » et « Créer un groupe »', async () => {
    api.groups = { groups: [], maxGroups: 5 };

    const { el } = await render();

    expect(find(el, 'ranking-empty')).not.toBeNull();
    expect(find(el, 'ranking-create')?.getAttribute('href')).toBe('/ranking/new');
    expect(find(el, 'ranking-list')).toBeNull();
  });

  it('un invité ou un visiteur est invité à créer un compte, sans rien demander au serveur', async () => {
    const { el } = await render('/ranking', 'guest');

    expect(find(el, 'ranking-guest')).not.toBeNull();
    expect(find(el, 'ranking-login')?.getAttribute('href')).toBe('/account/login');
    expect(api.calls).toEqual([]);
  });

  it('une invitation en attente est proposée à un compte', async () => {
    const { el } = await render('/ranking', 'account', 'WXYZ6789');

    expect(find(el, 'ranking-pending')?.getAttribute('href')).toBe('/ranking/join/WXYZ6789');
  });

  it('une panne se dit et se réessaie', async () => {
    api.failGroups = true;
    const { el, settle } = await render();
    expect(find(el, 'ranking-error')).not.toBeNull();

    api.failGroups = false;
    el.querySelector<HTMLButtonElement>('[data-testid="ranking-error"] button')!.click();
    await settle();
    expect(find(el, 'ranking-list')).not.toBeNull();
  });
});
