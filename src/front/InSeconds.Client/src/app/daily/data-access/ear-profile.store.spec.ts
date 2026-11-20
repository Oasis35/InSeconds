import { TestBed } from '@angular/core/testing';
import { FakeDailyApi, provideFakeDailyApi } from './testing/fake-daily-api';
import { EarProfileStore } from './ear-profile.store';

describe('EarProfileStore', () => {
  function create(fake = new FakeDailyApi()) {
    TestBed.configureTestingModule({ providers: [EarProfileStore, provideFakeDailyApi(fake)] });
    return { store: TestBed.inject(EarProfileStore), fake };
  }

  it('lit le profil de la période demandée', async () => {
    const { store, fake } = create();

    await store.load('6m');

    expect(fake.calls).toEqual(['earProfile 6m']);
    expect(store.status()).toBe('ready');
    expect(store.period()).toBe('6m');
    expect(store.profile()?.bestStreak).toBe(14);
  });

  it('passe en erreur quand la lecture échoue', async () => {
    const fake = new FakeDailyApi();
    fake.earProfile = new Error('panne');
    const { store } = create(fake);

    await store.load('8w');

    expect(store.status()).toBe('error');
  });
});
