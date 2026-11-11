import { TestBed } from '@angular/core/testing';
import { SessionPlayer, SessionStore } from '../../core/session/session.store';
import { AdminCounts } from './admin-counts';

const admin = (id: string): SessionPlayer => ({ id, pseudo: 'Admin', email: 'a@x.fr', isGuest: false, isAdmin: true });

describe('AdminCounts', () => {
  let session: InstanceType<typeof SessionStore>;
  let counts: AdminCounts;

  beforeEach(() => {
    session = TestBed.inject(SessionStore);
    session.signedIn(admin('admin-1'));
    counts = TestBed.inject(AdminCounts);
    TestBed.tick();
    counts.setChallenges(30);
    counts.setPlayers(12);
    counts.setCandidates(8);
  });

  it('garde les effectifs tant que le même compte est connecté', () => {
    session.signedIn(admin('admin-1'));
    TestBed.tick();

    expect([counts.challenges(), counts.players(), counts.candidates()]).toEqual([30, 12, 8]);
  });

  it('oublie les effectifs à la déconnexion', () => {
    session.signedOut();
    TestBed.tick();

    expect([counts.challenges(), counts.players(), counts.candidates()]).toEqual([null, null, null]);
  });

  it('oublie les effectifs quand un autre compte se connecte', () => {
    session.signedIn(admin('admin-2'));
    TestBed.tick();

    expect([counts.challenges(), counts.players(), counts.candidates()]).toEqual([null, null, null]);
  });
});
