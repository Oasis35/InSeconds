import { Provider } from '@angular/core';
import { AdminGroup } from '../../domain/admin-group';
import { AdminGroupsApi } from '../groups.api';

export function adminGroup(overrides: Partial<AdminGroup> = {}): AdminGroup {
  return { id: 1, name: 'Les copains', memberCount: 3, ownerId: 'a', ownerPseudo: 'Alice', createdAt: '2026-11-01T10:00:00Z', ...overrides };
}

function defaults() {
  return {
    list: vi.fn<() => Promise<AdminGroup[]>>(() => Promise.resolve([])),
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
