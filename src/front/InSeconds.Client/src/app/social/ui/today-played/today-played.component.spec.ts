import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { TodayScoreEntry } from '../../domain/group-scores';
import { TodayPlayedComponent } from './today-played.component';

describe('TodayPlayedComponent', () => {
  const entries: TodayScoreEntry[] = [
    { rank: null, pseudo: 'Moi', isMe: true, played: false, score: null },
    { rank: null, pseudo: 'Sam', isMe: false, played: false, score: null },
    { rank: null, pseudo: 'Théo', isMe: false, played: true, score: null },
  ];

  function render() {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(TodayPlayedComponent);
    fixture.componentRef.setInput('entries', entries);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('dit qui a joué, ceux qui ont joué d\'abord, sans aucun score', () => {
    const el = render();
    const members = [...el.querySelectorAll<HTMLElement>('[data-testid="today-member"]')];

    expect(members.map(member => member.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
      'T Théo social.scores.played', 'M social.ranking.me social.scores.notYet', 'S Sam social.scores.notYet',
    ]);
    expect(members.map(member => member.getAttribute('data-played'))).toEqual(['true', null, null]);
    expect(el.querySelector('[data-testid="today-count"]')?.textContent?.trim()).toBe('social.scores.playedCount');
    expect(el.querySelector('[data-testid="score-value"]')).toBeNull();
  });
});
