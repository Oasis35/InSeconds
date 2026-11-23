import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { SocialClient } from '../../api/social/api.generated';
import { AdminGroupsApi } from './groups.api';

describe('AdminGroupsApi', () => {
  const client = { transferAdminGroupOwner: vi.fn(), removeAdminGroupMember: vi.fn(), listAdminGroups: vi.fn(), listAdminGroupMembers: vi.fn(), renameAdminGroup: vi.fn(), resetAdminGroupName: vi.fn(), deleteAdminGroup: vi.fn() };

  function create(): AdminGroupsApi {
    TestBed.configureTestingModule({ providers: [AdminGroupsApi, { provide: SocialClient, useValue: client }] });
    return TestBed.inject(AdminGroupsApi);
  }

  it('convertit les groupes : date en texte, créateur sans pseudo en null', async () => {
    client.listAdminGroups.mockReturnValue(of({
      groups: [
        { id: 2, name: 'Les voisins', memberCount: 1, ownerId: 'b', ownerPseudo: 'Bob', createdAt: new Date('2026-11-02T10:00:00Z') },
        { id: 1, name: 'Les copains', memberCount: 3, ownerId: 'a', ownerPseudo: undefined, createdAt: '2026-11-01T10:00:00+00:00' },
      ],
    }));

    expect(await create().list()).toEqual([
      { id: 2, name: 'Les voisins', memberCount: 1, ownerId: 'b', ownerPseudo: 'Bob', createdAt: '2026-11-02T10:00:00.000Z' },
      { id: 1, name: 'Les copains', memberCount: 3, ownerId: 'a', ownerPseudo: null, createdAt: '2026-11-01T10:00:00+00:00' },
    ]);
  });

  it('convertit les membres : date en texte, pseudo absent en null', async () => {
    client.listAdminGroupMembers.mockReturnValue(of({
      members: [
        { pseudo: 'Alice', isOwner: true, joinedAt: new Date('2026-11-01T10:00:00Z') },
        { pseudo: undefined, isOwner: false, joinedAt: '2026-11-02T10:00:00+00:00' },
      ],
    }));

    expect(await create().members(4)).toEqual([
      { pseudo: 'Alice', isOwner: true, joinedAt: '2026-11-01T10:00:00.000Z' },
      { pseudo: null, isOwner: false, joinedAt: '2026-11-02T10:00:00+00:00' },
    ]);
    expect(client.listAdminGroupMembers).toHaveBeenCalledWith(4);
  });

  it('confie le groupe à un pseudo', async () => {
    client.transferAdminGroupOwner.mockReturnValue(of(undefined));
    await create().transferOwner(4, 'Bob');
    expect(client.transferAdminGroupOwner).toHaveBeenCalledWith(4, { pseudo: 'Bob' });
  });

  it('retire un membre, avec ou sans successeur', async () => {
    client.removeAdminGroupMember.mockReturnValue(of(undefined));
    const api = create();

    await api.removeMember(4, 'Alice', 'Bob');
    await api.removeMember(4, 'Carol', null);

    expect(client.removeAdminGroupMember).toHaveBeenNthCalledWith(1, 4, { pseudo: 'Alice', successor: 'Bob' });
    expect(client.removeAdminGroupMember).toHaveBeenNthCalledWith(2, 4, { pseudo: 'Carol', successor: undefined });
  });

  it('renomme et rend le nom enregistré', async () => {
    client.renameAdminGroup.mockReturnValue(of({ name: 'Les amis' }));
    expect(await create().rename(4, ' Les amis ')).toBe('Les amis');
    expect(client.renameAdminGroup).toHaveBeenCalledWith(4, { name: ' Les amis ' });
  });

  it('remet le nom à zéro et rend le nom de remplacement', async () => {
    client.resetAdminGroupName.mockReturnValue(of({ name: 'Groupe 4' }));
    expect(await create().resetName(4)).toBe('Groupe 4');
  });

  it('supprime', async () => {
    client.deleteAdminGroup.mockReturnValue(of(undefined));
    await create().remove(4);
    expect(client.deleteAdminGroup).toHaveBeenCalledWith(4);
  });
});
