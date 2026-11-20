import { TestBed } from '@angular/core/testing';
import { SessionStore } from '../../core/session/session.store';
import { ShellChromeStore } from '../../core/shell/shell-chrome.store';
import { MemoryStoragePort, StoragePort } from '../../core/storage/storage.port';
import { Group } from '../domain/group';
import { GroupsAnnounce } from './groups-announce';

describe('GroupsAnnounce', () => {
  const group: Group = { id: 4, name: 'Potes', inviteCode: 'ABCD2345', memberCount: 3, maxMembers: 15, isOwner: true };

  function setup(storage = new MemoryStoragePort(), today = '2026-11-21') {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(`${today}T10:00:00Z`));
    TestBed.configureTestingModule({ providers: [{ provide: StoragePort, useValue: storage }] });
    return { announce: TestBed.inject(GroupsAnnounce), chrome: TestBed.inject(ShellChromeStore), storage };
  }

  afterEach(() => vi.useRealTimers());

  it("d'abord la carte, ni pastille ni point", () => {
    const { announce, chrome } = setup();
    announce.setGroups([]);
    TestBed.tick();

    expect(announce.card()).toBe(true);
    expect(announce.chip()).toBe(false);
    expect(chrome.groupsNew()).toBe(false);
  });

  it('la fermer la garde dans le navigateur et passe à la pastille et au point, pour un compte sans groupe', () => {
    const { announce, chrome, storage } = setup();
    announce.setGroups([]);
    announce.close();
    TestBed.tick();

    expect(announce.card()).toBe(false);
    expect(announce.chip()).toBe(true);
    expect(chrome.groupsNew()).toBe(true);
    expect(storage.get('inseconds.announce.groups.closed')).toBe('1');
  });

  it("ouvrir l'onglet Groupes éteint le point, la pastille reste", () => {
    const { announce, chrome } = setup();
    announce.setGroups([]);
    announce.close();
    announce.markRankingSeen();
    TestBed.tick();

    expect(chrome.groupsNew()).toBe(false);
    expect(announce.chip()).toBe(true);
  });

  it('un membre, ou des groupes illisibles : ni pastille ni point', () => {
    const { announce, chrome } = setup();
    announce.close();
    announce.setGroups([group]);
    TestBed.tick();
    expect(announce.chip()).toBe(false);
    expect(chrome.groupsNew()).toBe(false);

    announce.setGroups('failed');
    TestBed.tick();
    expect(announce.chip()).toBe(false);
  });

  it('un compte peut créer un groupe sous le maximum du serveur, plus au maximum ni sans lecture', () => {
    const { announce } = setup();
    expect(announce.canCreate()).toBe(false);

    announce.setGroups([group], 5);
    expect(announce.canCreate()).toBe(true);

    announce.setGroups([group], 1);
    expect(announce.canCreate()).toBe(false);

    announce.setGroups('failed');
    expect(announce.canCreate()).toBe(false);
  });

  it("la déconnexion efface les groupes lus : l'ancien compte ne s'affiche plus", () => {
    const { announce } = setup();
    const session = TestBed.inject(SessionStore);
    session.signedIn({ id: 'p1', pseudo: 'Clem', email: 'c@x.fr', isGuest: false, isAdmin: false });
    TestBed.tick();
    announce.setGroups([group]);

    session.signedOut();
    TestBed.tick();

    expect(announce.groups()).toBeNull();
  });

  it('une carte déjà fermée au dernier passage reste fermée', () => {
    const storage = new MemoryStoragePort();
    storage.set('inseconds.announce.groups.closed', '1');
    const { announce } = setup(storage);

    expect(announce.card()).toBe(false);
  });

  it('après le dernier jour, plus rien', () => {
    const { announce, chrome } = setup(new MemoryStoragePort(), '2026-12-12');
    announce.setGroups([]);
    announce.close();
    TestBed.tick();

    expect(announce.card()).toBe(false);
    expect(announce.chip()).toBe(false);
    expect(chrome.groupsNew()).toBe(false);
  });
});
