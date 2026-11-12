import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { Streak } from '../../domain/streak';
import { HomeChallengeCardComponent } from './home-challenge-card.component';

const PROTECTED: Streak = {
  status: 'protected', streak: 12, freezes: 1, maxFreezes: 2, freezeEveryDays: 7,
  nextFreezeInDays: 2, missedDays: 1, lostStreak: null, lastPlayedDate: null,
};

describe('HomeChallengeCardComponent', () => {
  function render(inputs: Record<string, unknown> = {}) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(HomeChallengeCardComponent);
    fixture.componentRef.setInput('trackCount', 5);
    fixture.componentRef.setInput('linked', true);
    for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    return { fixture, element, q: (id: string) => element.querySelector(`[data-testid="${id}"]`) };
  }

  it('« Commencer » lance la partie', () => {
    const { fixture, q } = render();
    const spy = vi.fn();
    fixture.componentInstance.startGame.subscribe(spy);
    (q('home-start') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalled();
  });

  it('le record du joueur passe avant la médiane des autres', () => {
    const { q } = render({ bestScore: 3120, yesterdayMedian: 1840 });
    expect(q('welcome-record')?.textContent).toContain('3120');
    expect(q('welcome-target')).toBeNull();
  });

  it('sans record : la médiane d’hier ; sans rien : aucune ligne', () => {
    expect(render({ yesterdayMedian: 1840 }).q('welcome-target')?.textContent).toContain('1840');
    const empty = render();
    expect(empty.q('welcome-record')).toBeNull();
    expect(empty.q('welcome-target')).toBeNull();
  });

  it('première visite du jour : pas de rappel', () => {
    expect(render().q('home-remaining')).toBeNull();
  });

  it('au retour : le rappel en heures, en minutes sous une heure', () => {
    expect(render({ remaining: { unit: 'hours', value: 6 } }).q('home-remaining')?.textContent).toContain('daily.home.remainingHours');
    expect(render({ remaining: { unit: 'minutes', value: 40 } }).q('home-remaining')?.textContent).toContain('daily.home.remainingMinutes');
  });

  it('une série protégée par un gel le dit', () => {
    expect(render({ streak: PROTECTED }).q('frozen-line')).not.toBeNull();
    expect(render().q('frozen-line')).toBeNull();
  });
});
