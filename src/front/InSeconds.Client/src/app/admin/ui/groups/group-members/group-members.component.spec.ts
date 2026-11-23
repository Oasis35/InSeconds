import { Component, signal } from '@angular/core';
import { AdminGroupMember } from '../../../domain/admin-group';
import { MemberRemoval } from './group-members.component';
import { adminGroupMember } from '../../../data-access/testing/fake-admin-groups-api';
import { renderHost } from '../../testing/host';
import { GroupMembersComponent } from './group-members.component';

const ALICE = { pseudo: 'Alice', isOwner: true, joinedAt: '2026-11-01T10:00:00Z' };
const BOB = { pseudo: 'Bob', isOwner: false, joinedAt: '2026-11-02T10:00:00Z' };
const CAROL = { pseudo: 'Carol', isOwner: false, joinedAt: '2026-11-03T10:00:00Z' };

@Component({
  imports: [GroupMembersComponent],
  template: `<app-group-members [members]="members()" [status]="status()" [pending]="pending()" [errorKey]="errorKey()"
    (ownerChanged)="owners.push($event)" (removed)="removals.push($event)" />`,
})
class HostComponent {
  members = signal<readonly AdminGroupMember[] | null>(null);
  status = signal<'idle' | 'loading' | 'error'>('loading');
  pending = signal(false);
  errorKey = signal<string | null>(null);
  owners: string[] = [];
  removals: MemberRemoval[] = [];
}

describe('GroupMembersComponent', () => {
  const rows = (element: HTMLElement) => element.querySelectorAll('[data-testid="group-member"]');

  it('montre le chargement tant que rien n\'est lu', () => {
    const { element } = renderHost(HostComponent);
    expect(element.textContent).toContain('admin.groups.membersLoading');
    expect(rows(element)).toHaveLength(0);
  });

  it('liste les membres, avec le créateur marqué', () => {
    const { fixture, element, host } = renderHost(HostComponent);
    host.members.set([adminGroupMember({ pseudo: 'Alice', isOwner: true }), adminGroupMember({ pseudo: 'Bob' })]);
    host.status.set('idle');
    fixture.detectChanges();
    expect(rows(element)).toHaveLength(2);
    expect(rows(element)[0].textContent).toContain('Alice');
    expect(rows(element)[0].textContent).toContain('admin.groups.owner');
    expect(rows(element)[1].textContent).toContain('Bob');
    expect(rows(element)[1].textContent).not.toContain('admin.groups.owner');
  });

  /** Monte la liste lue de ces membres, prête à recevoir un clic sur l'action d'un membre. */
  function renderMembers(members: readonly AdminGroupMember[]) {
    const rendered = renderHost(HostComponent);
    rendered.host.members.set(members);
    rendered.host.status.set('idle');
    rendered.fixture.detectChanges();
    const rowOf = (pseudo: string) => [...rendered.element.querySelectorAll<HTMLElement>('[data-testid="group-member"]')].find(row => row.textContent?.includes(pseudo))!;
    const press = (pseudo: string, testId: string) => {
      rowOf(pseudo).querySelector<HTMLElement>(`[data-testid="${testId}"]`)!.click();
      rendered.fixture.detectChanges();
    };
    const byId = (testId: string) => rendered.element.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
    return { ...rendered, rowOf, press, byId };
  }

  it('désigner un autre créateur prévient que l\'ancien redevient simple membre, puis demande confirmation', () => {
    const { host, rowOf, press, byId } = renderMembers([ALICE, BOB]);
    expect(rowOf('Alice').querySelector('[data-testid="member-make-owner"]')).toBeNull();

    press('Bob', 'member-make-owner');
    expect(host.owners).toEqual([]);
    expect(byId('member-confirm')?.textContent).toContain('admin.groups.makeOwnerWarning');

    press('Bob', 'confirm-make-owner');
    expect(host.owners).toEqual(['Bob']);
  });

  it('retirer un simple membre demande confirmation, et peut renoncer', () => {
    const { host, fixture, press, byId, element } = renderMembers([ALICE, BOB, CAROL]);

    press('Carol', 'member-remove');
    expect(host.removals).toEqual([]);
    expect(byId('member-confirm')?.textContent).toContain('admin.groups.removeMemberConfirm');
    [...element.querySelectorAll<HTMLButtonElement>('button')].find(b => b.textContent?.includes('admin.groups.cancel'))!.click();
    fixture.detectChanges();
    expect(byId('member-confirm')).toBeNull();
    expect(host.removals).toEqual([]);

    press('Carol', 'member-remove');
    press('Carol', 'confirm-remove-member');
    expect(host.removals).toEqual([{ pseudo: 'Carol', successor: null }]);
  });

  it('retirer le créateur oblige à désigner qui le devient, parmi les autres membres', () => {
    const { host, fixture, press, byId } = renderMembers([ALICE, BOB, CAROL]);

    press('Alice', 'member-remove');
    const select = byId('successor-select') as HTMLSelectElement;
    expect([...select.options].map(option => option.value)).toEqual(['', 'Bob', 'Carol']);
    expect((byId('confirm-remove-owner') as HTMLButtonElement).disabled).toBe(true);

    select.value = 'Carol';
    select.dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect((byId('confirm-remove-owner') as HTMLButtonElement).disabled).toBe(false);
    byId('confirm-remove-owner')!.click();

    expect(host.removals).toEqual([{ pseudo: 'Alice', successor: 'Carol' }]);
  });

  it('retirer le seul membre prévient que le groupe sera supprimé', () => {
    const { host, press, byId } = renderMembers([ALICE]);

    press('Alice', 'member-remove');

    expect(byId('member-confirm')?.textContent).toContain('admin.groups.removeLastWarning');
    expect(byId('successor-select')).toBeNull();
    press('Alice', 'confirm-remove-member');
    expect(host.removals).toEqual([{ pseudo: 'Alice', successor: null }]);
  });

  it('la confirmation se ferme quand l\'attente se termine sans refus, et reste avec un refus', () => {
    const { host, fixture, press, byId } = renderMembers([ALICE, BOB]);
    press('Bob', 'member-remove');

    host.pending.set(true);
    fixture.detectChanges();
    host.pending.set(false);
    host.errorKey.set('errors.social.owner_must_hand_over');
    fixture.detectChanges();
    expect(byId('member-confirm')).not.toBeNull();
    expect(byId('member-error')).not.toBeNull();

    host.pending.set(true);
    fixture.detectChanges();
    host.pending.set(false);
    host.errorKey.set(null);
    fixture.detectChanges();
    expect(byId('member-confirm')).toBeNull();
  });

  it('un membre sans pseudo s\'affiche en tiret', () => {
    const { fixture, element, host } = renderHost(HostComponent);
    host.members.set([adminGroupMember({ pseudo: null })]);
    host.status.set('idle');
    fixture.detectChanges();
    expect(rows(element)[0].textContent).toContain('-');
  });

  it('montre l\'erreur de lecture tant que rien n\'est lu', () => {
    const { fixture, element, host } = renderHost(HostComponent);
    host.status.set('error');
    fixture.detectChanges();
    expect(element.querySelector('[role="alert"]')?.textContent).toContain('admin.groups.membersError');
  });

  it('garde les membres déjà lus quand une relecture échoue', () => {
    const { fixture, element, host } = renderHost(HostComponent);
    host.members.set([adminGroupMember({ pseudo: 'Alice' })]);
    host.status.set('error');
    fixture.detectChanges();
    expect(rows(element)).toHaveLength(1);
    expect(element.querySelector('[role="alert"]')).toBeNull();
  });
});
