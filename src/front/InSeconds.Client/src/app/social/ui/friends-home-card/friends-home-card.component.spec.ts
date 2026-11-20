import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { FriendsCardView } from '../../domain/friends-card';
import { FriendsHomeCardComponent } from './friends-home-card.component';

describe('FriendsHomeCardComponent', () => {
  function render(view: FriendsCardView): HTMLElement {
    TestBed.configureTestingModule({ providers: [provideTranslateService(), provideRouter([])] });
    const fixture = TestBed.createComponent(FriendsHomeCardComponent);
    fixture.componentRef.setInput('view', view);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const all = (element: HTMLElement, id: string) => [...element.querySelectorAll<HTMLElement>(`[data-testid="${id}"]`)];
  const one = (element: HTMLElement, id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);

  it('un invité : « Créer un compte » en contour neutre', () => {
    const element = render({ kind: 'guest' });

    const login = one(element, 'friends-card-login');
    expect(login?.getAttribute('href')).toBe('/account/login');
    expect(login?.classList).toContain('app-button--neutral');
    expect(one(element, 'friends-card-create')).toBeNull();
  });

  it("un invité dont le jeu du jour montre déjà l'appel : pas de second bouton", () => {
    TestBed.configureTestingModule({ providers: [provideTranslateService(), provideRouter([])] });
    const fixture = TestBed.createComponent(FriendsHomeCardComponent);
    fixture.componentRef.setInput('view', { kind: 'guest' });
    fixture.componentRef.setInput('showLogin', false);
    fixture.detectChanges();

    expect(one(fixture.nativeElement as HTMLElement, 'friends-card-login')).toBeNull();
  });

  it('la pastille « Nouveau » seulement si on la demande, pour un invité ou un compte sans groupe', () => {
    TestBed.configureTestingModule({ providers: [provideTranslateService(), provideRouter([])] });
    const fixture = TestBed.createComponent(FriendsHomeCardComponent);
    fixture.componentRef.setInput('view', { kind: 'no_group' });
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    expect(one(element, 'friends-card-new')).toBeNull();

    fixture.componentRef.setInput('showNew', true);
    fixture.detectChanges();
    expect(one(element, 'friends-card-new')).not.toBeNull();
  });

  it('un compte sans groupe : « Créer un groupe »', () => {
    const element = render({ kind: 'no_group' });

    expect(one(element, 'friends-card-create')?.getAttribute('href')).toBe('/ranking/new');
    expect(one(element, 'friends-card-login')).toBeNull();
  });

  it('défi à faire : le groupe, combien ont joué et une pastille par membre, aucun score', () => {
    const element = render({
      kind: 'pending', groupId: 4, name: 'Potes', played: 2, total: 3,
      members: [{ pseudo: 'Léa', isMe: false, played: true }, { pseudo: 'Théo', isMe: false, played: true }, { pseudo: 'Moi', isMe: true, played: false }],
    });

    expect(one(element, 'friends-card-title')?.textContent?.trim()).toBe('Potes');
    expect(one(element, 'friends-card-played')?.textContent?.trim()).toBe('social.scores.playedCount');
    const members = all(element, 'friends-card-member');
    expect(members.map(member => member.dataset['played'])).toEqual(['true', 'true', 'false']);
    expect(members[2].dataset['me']).toBe('true');
    expect(all(element, 'friends-card-score')).toHaveLength(0);
    expect(one(element, 'friends-card-ranking')?.getAttribute('href')).toBe('/ranking?group=4');
  });

  it("défi à faire, seul dans le groupe : l'invitation à inviter, sans pastilles", () => {
    const element = render({ kind: 'pending', groupId: 4, name: 'Potes', played: 0, total: 1, members: [{ pseudo: 'Moi', isMe: true, played: false }] });

    expect(one(element, 'friends-card-played')?.textContent?.trim()).toBe('social.home.alone');
    expect(one(element, 'friends-card-members')).toBeNull();
  });

  it("défi à faire, personne n'a encore joué", () => {
    const element = render({
      kind: 'pending', groupId: 4, name: 'Potes', played: 0, total: 2,
      members: [{ pseudo: 'Moi', isMe: true, played: false }, { pseudo: 'Léa', isMe: false, played: false }],
    });

    expect(one(element, 'friends-card-played')?.textContent?.trim()).toBe('social.scores.playedNone');
  });

  it("défi fait : « Potes, aujourd'hui » et le haut du classement, la ligne du joueur marquée", () => {
    const element = render({
      kind: 'revealed', groupId: 4, name: 'Potes',
      top: [{ rank: 1, pseudo: 'Théo', isMe: false, played: true, score: 1910 }, { rank: 2, pseudo: 'Moi', isMe: true, played: true, score: 1380 }],
    });

    expect(one(element, 'friends-card-title')?.textContent?.trim()).toBe('social.home.todayTitle');
    expect(one(element, 'friends-card-ranking')?.getAttribute('href')).toBe('/ranking?group=4&period=today');
    const rows = all(element, 'friends-card-row');
    expect(rows).toHaveLength(2);
    expect(rows[1].dataset['me']).toBe('true');
    expect(all(element, 'friends-card-score').map(score => score.textContent?.trim())).toEqual([
      new Intl.NumberFormat('fr').format(1910), new Intl.NumberFormat('fr').format(1380),
    ]);
    expect(one(element, 'friends-card-members')).toBeNull();
  });

  it("défi fait mais personne de classé (abandon sans score) : une phrase plutôt qu'une liste vide", () => {
    const element = render({ kind: 'revealed', groupId: 4, name: 'Potes', top: [] });

    expect(one(element, 'friends-card-nobody')?.textContent?.trim()).toBe('social.home.nobodyFinished');
    expect(one(element, 'friends-card-top')).toBeNull();
  });

  it("une pastille dit qui a joué au lecteur d'écran, phrase accordée", () => {
    const element = render({
      kind: 'pending', groupId: 4, name: 'Potes', played: 1, total: 2,
      members: [{ pseudo: 'Léa', isMe: false, played: true }, { pseudo: 'Moi', isMe: true, played: false }],
    });

    expect(all(element, 'friends-card-member').map(member => member.querySelector('.sr-only')?.textContent?.trim())).toEqual([
      'social.home.memberPlayed', 'social.home.meWaiting',
    ]);
  });
});
