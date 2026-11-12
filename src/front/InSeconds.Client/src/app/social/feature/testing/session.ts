import { TestBed } from '@angular/core/testing';
import { SessionStore } from '../../../core/session/session.store';

/** Pose l'identité du navigateur pour un test : un compte, un invité, ou personne. */
export function signIn(kind: 'account' | 'guest' | 'nobody'): void {
  const session = TestBed.inject(SessionStore);
  if (kind !== 'nobody') session.signedIn({ id: 'p1', pseudo: kind === 'account' ? 'Clément' : null, email: null, isGuest: kind === 'guest', isAdmin: false });
  session.markLoaded();
}
