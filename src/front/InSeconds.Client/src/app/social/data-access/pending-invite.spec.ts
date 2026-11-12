import { TestBed } from '@angular/core/testing';
import { PendingInvite } from './pending-invite';

describe('PendingInvite', () => {
  let pending: PendingInvite;

  beforeEach(() => {
    pending = TestBed.inject(PendingInvite);
    pending.clear();
  });
  afterEach(() => pending.clear());

  it('garde le code d\'une invitation, en majuscules', () => {
    pending.set('abcd2345');

    expect(pending.get()).toBe('ABCD2345');
  });

  it('ignore ce qui n\'est pas un code, et s\'oublie', () => {
    pending.set('<script>');
    expect(pending.get()).toBeNull();

    pending.set('ABCD2345');
    pending.clear();
    expect(pending.get()).toBeNull();
  });
});
