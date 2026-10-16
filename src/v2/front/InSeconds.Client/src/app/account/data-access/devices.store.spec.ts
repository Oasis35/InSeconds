import { TestBed } from '@angular/core/testing';
import { SessionStore } from '../../core/session/session.store';
import { DevicesStore } from './devices.store';
import { FakePlayersApi, device, fakePlayersApi, linkedPlayer, problem, providePlayersApiFake } from './testing/fake-players-api';

describe('DevicesStore', () => {
  const current = device({ id: 1, isCurrent: true });
  const other = device({ id: 2, label: 'Safari · iPhone' });
  const third = device({ id: 3, label: null });

  let api: FakePlayersApi;
  let store: InstanceType<typeof DevicesStore>;
  let session: InstanceType<typeof SessionStore>;

  function setup(overrides: Parameters<typeof fakePlayersApi>[0] = {}) {
    api = fakePlayersApi({ listDevices: vi.fn(async () => [current, other, third]), ...overrides });
    TestBed.configureTestingModule({ providers: [DevicesStore, providePlayersApiFake(api)] });
    store = TestBed.inject(DevicesStore);
    session = TestBed.inject(SessionStore);
    session.signedIn(linkedPlayer);
  }

  it('charge les appareils et distingue les autres', async () => {
    setup();

    await store.load();

    expect(store.devices()).toEqual([current, other, third]);
    expect(store.others()).toEqual([other, third]);
    expect(store.isFulfilled()).toBe(true);
  });

  it('garde le code d\'erreur quand le chargement échoue', async () => {
    setup({ listDevices: vi.fn(async () => Promise.reject(problem(401, 'common.unauthorized'))) });

    await store.load();

    expect(store.error()?.code).toBe('common.unauthorized');
    expect(store.devices()).toEqual([]);
  });

  it('déconnecte un autre appareil et le retire de la liste', async () => {
    setup();
    await store.load();

    const pending = store.revoke(2);
    expect(store.busyId()).toBe(2);

    expect(await pending).toBe('revoked');
    expect(api.revokeDevice).toHaveBeenCalledWith(2);
    expect(store.devices().map(d => d.id)).toEqual([1, 3]);
    expect(store.busyId()).toBeNull();
    expect(session.isLinked()).toBe(true);
  });

  it('déconnecter l\'appareil courant vide la session', async () => {
    setup();
    await store.load();

    expect(await store.revoke(1)).toBe('signed-out');

    expect(session.player()).toBeNull();
    expect(store.devices()).toEqual([]);
  });

  it('garde la liste et l\'erreur quand la déconnexion échoue', async () => {
    setup({ revokeDevice: vi.fn(async () => Promise.reject(problem(404, 'common.not_found'))) });
    await store.load();

    expect(await store.revoke(2)).toBe('failed');

    expect(store.devices()).toHaveLength(3);
    expect(store.busyId()).toBeNull();
    expect(store.action()).toMatchObject({ error: { code: 'common.not_found' } });
  });

  it('déconnecte tous les autres appareils et garde le courant', async () => {
    setup();
    await store.load();

    expect(await store.revokeOthers()).toBe(true);

    expect(api.revokeOtherDevices).toHaveBeenCalledTimes(1);
    expect(store.devices()).toEqual([current]);
  });

  it('garde la liste quand « déconnecter les autres » échoue', async () => {
    setup({ revokeOtherDevices: vi.fn(async () => Promise.reject(problem(429, 'common.too_many_requests'))) });
    await store.load();

    expect(await store.revokeOthers()).toBe(false);

    expect(store.devices()).toHaveLength(3);
    expect(store.action()).toMatchObject({ error: { code: 'common.too_many_requests' } });
  });
});
