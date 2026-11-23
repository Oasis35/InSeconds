import { Provider } from '@angular/core';
import { AdminGroup, AdminGroupMember } from '../../domain/admin-group';
import { AdminGroupsApi } from '../groups.api';

export function adminGroup(overrides: Partial<AdminGroup> = {}): AdminGroup {
  return { id: 1, name: 'Les copains', memberCount: 3, ownerId: 'a', ownerPseudo: 'Alice', createdAt: '2026-11-01T10:00:00Z', ...overrides };
}

export function adminGroupMember(overrides: Partial<AdminGroupMember> = {}): AdminGroupMember {
  return { pseudo: 'Alice', isOwner: false, joinedAt: '2026-11-01T10:00:00Z', ...overrides };
}

function defaults() {
  return {
    list: vi.fn<() => Promise<AdminGroup[]>>(() => Promise.resolve([])),
    members: vi.fn<(id: number) => Promise<AdminGroupMember[]>>(() => Promise.resolve([])),
    transferOwner: vi.fn<(id: number, pseudo: string) => Promise<void>>(() => Promise.resolve()),
    removeMember: vi.fn<(id: number, pseudo: string, successor: string | null) => Promise<void>>(() => Promise.resolve()),
    rename: vi.fn<(id: number, name: string) => Promise<string>>((_id, name) => Promise.resolve(name.trim())),
    resetName: vi.fn<(id: number) => Promise<string>>(id => Promise.resolve(`Groupe ${id}`)),
    remove: vi.fn<(id: number) => Promise<void>>(() => Promise.resolve()),
  } satisfies Record<keyof AdminGroupsApi, unknown>;
}

export type FakeAdminGroupsApi = ReturnType<typeof defaults>;

/** Faux `AdminGroupsApi` : chaque méthode est un espion qui réussit par défaut. */
export function fakeAdminGroupsApi(overrides: Partial<FakeAdminGroupsApi> = {}): FakeAdminGroupsApi {
  return { ...defaults(), ...overrides };
}

export function provideAdminGroupsApiFake(api: FakeAdminGroupsApi): Provider {
  return { provide: AdminGroupsApi, useValue: api };
}
