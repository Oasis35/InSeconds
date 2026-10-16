import { TestBed } from '@angular/core/testing';
import { patchState, signalStore, withMethods } from '@ngrx/signals';
import { setError, setFulfilled, setPending, withRequestStatus } from './with-request-status';
import { AppError } from '../errors/app-error';

const TestStore = signalStore(
  withRequestStatus(),
  withMethods(store => ({
    start: () => patchState(store, setPending()),
    succeed: () => patchState(store, setFulfilled()),
    fail: (error: AppError) => patchState(store, setError(error)),
  })),
);

describe('withRequestStatus', () => {
  const error: AppError = { code: 'common.unexpected', status: 500, traceId: 'abc' };
  let store: InstanceType<typeof TestStore>;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [TestStore] });
    store = TestBed.inject(TestStore);
  });

  it('part au repos', () => {
    expect(store.requestStatus()).toBe('idle');
    expect(store.isPending()).toBe(false);
    expect(store.isFulfilled()).toBe(false);
    expect(store.error()).toBeNull();
  });

  it('suit chargement, succès puis erreur avec son code', () => {
    store.start();
    expect(store.isPending()).toBe(true);

    store.succeed();
    expect(store.isPending()).toBe(false);
    expect(store.isFulfilled()).toBe(true);

    store.fail(error);
    expect(store.isFulfilled()).toBe(false);
    expect(store.error()).toEqual(error);
  });

  it('efface l\'erreur au chargement suivant', () => {
    store.fail(error);
    store.start();

    expect(store.error()).toBeNull();
  });
});
