import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { SessionPlayer, SessionStore } from '../../../core/session/session.store';
import { MemoryStoragePort, StoragePort } from '../../../core/storage/storage.port';
import { GroupsAnnounce } from '../../data-access/groups-announce';
import { Group } from '../../domain/group';
import { GroupsAnnounceEntryComponent } from './groups-announce-entry.component';

describe('GroupsAnnounceEntryComponent', () => {
  const player = (isGuest: boolean): SessionPlayer => ({ id: 'p1', pseudo: 'Clem', email: isGuest ? null : 'c@x.fr', isGuest, isAdmin: false });
  const group: Group = { id: 4, name: 'Potes', inviteCode: 'ABCD2345', memberCount: 3, maxMembers: 15, isOwner: true };

  function render(signedIn: SessionPlayer | null, groups: readonly Group[] | 'failed' | null, storage = new MemoryStoragePort()): ComponentFixture<GroupsAnnounceEntryComponent> {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-21T10:00:00Z'));
    TestBed.configureTestingModule({ providers: [provideTranslateService(), provideRouter([]), { provide: StoragePort, useValue: storage }] });
    const session = TestBed.inject(SessionStore);
    if (signedIn) session.signedIn(signedIn);
    session.markLoaded();
    if (groups !== null) TestBed.inject(GroupsAnnounce).setGroups(groups);
    const fixture = TestBed.createComponent(GroupsAnnounceEntryComponent);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => vi.useRealTimers());

  const el = (fixture: ComponentFixture<unknown>) => fixture.nativeElement as HTMLElement;
  const card = (fixture: ComponentFixture<unknown>) => el(fixture).querySelector<HTMLElement>('[data-testid="groups-announce"]');

  it("un invité : la carte tout de suite, sans attendre de groupes", () => {
    const fixture = render(null, null);

    expect(card(fixture)?.getAttribute('data-variant')).toBe('guest');
  });

  it("un compte : sa place est gardée tant que ses groupes ne sont pas lus", () => {
    const fixture = render(player(false), null);

    expect(card(fixture)).toBeNull();
    expect(el(fixture).querySelector('[data-testid="groups-announce-placeholder"]')).not.toBeNull();
  });

  it('un compte sans groupe, puis avec un groupe', () => {
    const fixture = render(player(false), []);
    expect(card(fixture)?.getAttribute('data-variant')).toBe('no_group');

    TestBed.inject(GroupsAnnounce).setGroups([group]);
    fixture.detectChanges();
    expect(card(fixture)?.getAttribute('data-variant')).toBe('member');
  });

  it('groupes illisibles : rien, pas même la place', () => {
    const fixture = render(player(false), 'failed');

    expect(card(fixture)).toBeNull();
    expect(el(fixture).querySelector('[data-testid="groups-announce-placeholder"]')).toBeNull();
  });

  it('la croix ferme la carte', () => {
    const fixture = render(player(false), []);

    el(fixture).querySelector<HTMLElement>('[data-testid="groups-announce-close"]')?.click();
    fixture.detectChanges();

    expect(card(fixture)).toBeNull();
  });
});
