import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { settle } from '../../../account/feature/testing/dom';
import { SocialApi } from '../../data-access/social.api';
import { FakeSocialApi } from '../../data-access/testing/fake-social-api';
import { DayFriendsComponent } from './day-friends.component';

describe('DayFriendsComponent', () => {
  async function render(fake = new FakeSocialApi(), date = '2026-11-19') {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    TestBed.overrideComponent(DayFriendsComponent, { set: { providers: [{ provide: SocialApi, useValue: fake }] } });
    const fixture = TestBed.createComponent(DayFriendsComponent);
    fixture.componentRef.setInput('date', date);
    await settle(fixture);
    return { fixture, fake, el: fixture.nativeElement as HTMLElement };
  }

  it('le classement du premier groupe ce jour-là, sa ligne à lui, « pas joué » pour les absents', async () => {
    const { el, fake } = await render();

    expect(fake.calls).toEqual(['myGroups', 'dayScores:4:2026-11-19']);
    const rows = [...el.querySelectorAll('[data-testid="day-friends-row"]')].map(r => r.textContent!.replace(/\s+/g, ' ').trim());
    expect(rows).toHaveLength(3);
    expect(rows[0]).toContain('Léa');
    expect(rows[1]).toContain('social.dayFriends.me');
    expect(rows[2]).toContain('social.dayFriends.notPlayed');
  });

  it('une pastille par groupe ; en toucher une relit ses scores', async () => {
    const { fixture, el, fake } = await render();

    el.querySelector<HTMLButtonElement>('[data-testid="day-friends-group-7"]')!.click();
    await settle(fixture);

    expect(fake.calls.at(-1)).toBe('dayScores:7:2026-11-19');
    expect(el.querySelectorAll('[data-testid="day-friends-row"]')).toHaveLength(1);
  });

  it('caché tant qu’il peut encore jouer ce défi : aucune ligne', async () => {
    const fake = new FakeSocialApi();
    fake.dayScoresByGroup.set(4, { groupId: 4, name: 'Potes', day: '2026-11-19', revealed: false, entries: [] });
    const { el } = await render(fake);

    expect(el.querySelector('[data-testid="day-friends-hidden"]')).not.toBeNull();
    expect(el.querySelector('[data-testid="day-friends-row"]')).toBeNull();
  });

  it('sans groupe, ou en cas d’erreur : rien', async () => {
    const empty = new FakeSocialApi();
    empty.groups = { groups: [], maxGroups: 5 };
    expect((await render(empty)).el.querySelector('[data-testid="day-friends"]')).toBeNull();
    TestBed.resetTestingModule();

    const failing = new FakeSocialApi();
    failing.failGroups = true;
    expect((await render(failing)).el.querySelector('[data-testid="day-friends"]')).toBeNull();
  });
});
