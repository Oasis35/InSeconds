import { Component, signal } from '@angular/core';
import { adminGroup, adminGroupMember } from '../../../data-access/testing/fake-admin-groups-api';
import { finishPending, renderHost } from '../../testing/host';
import { GroupRowComponent } from './group-row.component';

@Component({
  imports: [GroupRowComponent],
  template: `<ul><li appGroupRow [group]="group" [expanded]="expanded()" [members]="members" (toggled)="expanded.set(!expanded())"
    [pending]="pending()" [errorKey]="errorKey()" (renamed)="renamed.push($event)" (ownerChanged)="owners.push($event)" (memberRemoved)="memberRemovals.push($event)" (resetNameRequested)="resets = resets + 1" (removeRequested)="removals = removals + 1"></li></ul>`,
})
class HostComponent {
  group = adminGroup({ id: 4, name: 'Les copains', memberCount: 3, ownerPseudo: 'Alice' });
  expanded = signal(false);
  members = [adminGroupMember({ pseudo: 'Alice', isOwner: true }), adminGroupMember({ pseudo: 'Bob' })];
  pending = signal(false);
  errorKey = signal<string | null>(null);
  renamed: string[] = [];
  owners: string[] = [];
  memberRemovals: { pseudo: string; successor: string | null }[] = [];
  resets = 0;
  removals = 0;
}

describe('GroupRowComponent', () => {
  /** Monte la ligne dépliée : la modération n'existe qu'ainsi. */
  const render = () => {
    const rendered = renderHost(HostComponent);
    rendered.click('group-toggle');
    return rendered;
  };

  it('montre le nom et le créateur', () => {
    const { element } = render();
    expect(element.textContent).toContain('Les copains');
    expect(element.textContent).toContain('Alice');
  });

  it('replié, ne montre ni les membres ni aucun bouton de modération', () => {
    const { element } = renderHost(HostComponent);
    expect(element.querySelector('[data-testid="group-panel"]')).toBeNull();
    for (const id of ['rename-group', 'reset-group-name', 'delete-group']) expect(element.querySelector(`[data-testid="${id}"]`)).toBeNull();
  });

  it('un clic sur le nom ou sur le nombre de membres déplie, puis replie', () => {
    const { element, click } = renderHost(HostComponent);
    click('group-toggle');
    expect(element.querySelector('[data-testid="group-panel"]')).not.toBeNull();
    expect(element.querySelectorAll('[data-testid="group-member"]')).toHaveLength(2);
    click('group-members-toggle');
    expect(element.querySelector('[data-testid="group-panel"]')).toBeNull();
    click('group-members-toggle');
    expect(element.querySelector('[data-testid="group-panel"]')).not.toBeNull();
  });

  it('replier annule une confirmation en cours : en rouvrant, la suppression n\'est plus armée', () => {
    const { element, host, click } = render();
    click('delete-group');
    expect(element.querySelector('[data-testid="confirm-delete"]')).not.toBeNull();
    click('group-toggle');
    click('group-toggle');
    expect(element.querySelector('[data-testid="confirm-delete"]')).toBeNull();
    expect(element.querySelector('[data-testid="delete-group"]')).not.toBeNull();
    expect(host.removals).toBe(0);
  });

  it('remonte le changement de créateur confirmé', () => {
    const { host, click } = render();
    click('member-make-owner');
    click('confirm-make-owner');
    expect(host.owners).toEqual(['Bob']);
  });

  it('remonte le retrait confirmé d\'un membre', () => {
    const { host, element, fixture, click } = render();
    element.querySelectorAll<HTMLElement>('[data-testid="member-remove"]')[1].click();
    fixture.detectChanges();
    click('confirm-remove-member');
    expect(host.memberRemovals).toEqual([{ pseudo: 'Bob', successor: null }]);
  });

  it('renomme sur place avec le nom rogné', () => {
    const { fixture, element, host, click } = render();
    click('rename-group');
    const input = element.querySelector('input') as HTMLInputElement;
    expect(input.value).toBe('Les copains');
    input.value = '  Les amis ';
    input.dispatchEvent(new Event('input'));
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(host.renamed).toEqual(['Les amis']);
  });

  it('ne renomme pas avec un nom vide', () => {
    const { fixture, element, host, click } = render();
    click('rename-group');
    const input = element.querySelector('input') as HTMLInputElement;
    input.value = '   ';
    input.dispatchEvent(new Event('input'));
    element.querySelector('form')!.dispatchEvent(new Event('submit'));
    fixture.detectChanges();
    expect(host.renamed).toEqual([]);
  });

  it('demande confirmation avant de remettre le nom à zéro', () => {
    const { host, click } = render();
    click('reset-group-name');
    expect(host.resets).toBe(0);
    click('confirm-reset');
    expect(host.resets).toBe(1);
  });

  it('demande confirmation avant de supprimer, et peut renoncer', () => {
    const { element, host, click } = render();
    click('delete-group');
    expect(host.removals).toBe(0);
    expect(element.querySelector('[data-testid="confirm-delete"]')).not.toBeNull();
    (Array.from(element.querySelectorAll('button')).find(b => b.textContent?.includes('admin.groups.cancel')) as HTMLElement).click();
    expect(host.removals).toBe(0);
  });

  it('se referme quand l\'attente se termine sans refus, et reste ouverte avec un refus', () => {
    const { fixture, element, host, click } = render();
    click('delete-group');
    finishPending(fixture, host, 'errors.social.group_not_found');
    expect(element.querySelector('[data-testid="group-error"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="confirm-delete"]')).not.toBeNull();

    finishPending(fixture, host, null);
    expect(element.querySelector('[data-testid="confirm-delete"]')).toBeNull();
  });
});
