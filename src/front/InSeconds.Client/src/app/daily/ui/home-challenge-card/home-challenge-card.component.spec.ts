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

  it('la carte du défi est la tuile de focus : tube ambre', () => {
    expect(render().q('home-challenge')?.classList).toContain('tube-amber');
  });

  it('le bloc de l\'accueil d\'avant : « Blind test du jour » puis le nombre de morceaux', () => {
    const { element } = render();
    expect(element.querySelector('h2')?.textContent?.trim()).toBe('daily.welcome.title');
    expect(element.textContent).toContain('daily.welcome.subtitle');
  });

  it('le record du joueur passe avant la médiane des autres', () => {
    const { q } = render({ bestScore: 3120, yesterdayMedian: 1840 });
    expect(q('welcome-record')?.textContent).toMatch(/3\s120/);
    expect(q('welcome-target')).toBeNull();
  });

  it('sans record : la médiane d’hier ; sans rien : aucune ligne', () => {
    expect(render({ yesterdayMedian: 1840 }).q('welcome-target')?.textContent).toMatch(/1\s840/);
    const empty = render();
    expect(empty.q('welcome-record')).toBeNull();
    expect(empty.q('welcome-target')).toBeNull();
  });

  it('sans temps donné : pas de « plus que » ; la date est dans la carte', () => {
    expect(render().q('home-remaining')).toBeNull();
    expect(render({ dateLabel: 'vendredi 13 novembre' }).q('welcome-date')?.textContent).toContain('vendredi 13 novembre');
  });

  it('le temps qui reste : en heures, en minutes sous une heure', () => {
    expect(render({ remaining: { unit: 'hours', value: 6 } }).q('home-remaining')?.textContent).toContain('daily.home.remainingHours');
    expect(render({ remaining: { unit: 'minutes', value: 40 } }).q('home-remaining')?.textContent).toContain('daily.home.remainingMinutes');
  });

  it('la règle en une phrase, seulement pour qui n’a jamais joué', () => {
    expect(render({ firstGame: true }).q('welcome-how-to')?.textContent).toContain('daily.welcome.howTo');
    expect(render().q('welcome-how-to')).toBeNull();
    expect(render({ firstGame: true, completedCount: 2 }).q('welcome-how-to')).toBeNull();
  });

  it('une série protégée par un gel le dit', () => {
    expect(render({ streak: PROTECTED }).q('frozen-line')).not.toBeNull();
    expect(render().q('frozen-line')).toBeNull();
  });

  it('une partie en pause propose « Reprendre » et « Abandonner » en lien discret', () => {
    const { fixture, q } = render({ completedCount: 2 });
    expect(q('home-paused-progress')?.textContent).toContain('daily.resume.progress.other');
    expect(q('home-start')?.textContent).toContain('daily.resume.resume');
    const spy = vi.fn();
    fixture.componentInstance.abandon.subscribe(spy);
    (q('home-abandon') as HTMLButtonElement).click();
    expect(spy).toHaveBeenCalled();
  });

  it('sans partie en cours, pas de lien « Abandonner »', () => {
    expect(render().q('home-abandon')).toBeNull();
  });

  describe('accueil d\'un habitué', () => {
    const RECAP = { yesterdayScore: 2300, averageScore: 2000, weekGames: 6, weekFirstStepFound: 0 };

    it('une phrase sur lui, et le libellé du bouton y répond ; plus de « plus que 5 h » ni de score à battre', () => {
      const { q } = render({ recap: RECAP, remaining: { unit: 'hours', value: 5 }, bestScore: 4000 });
      expect(q('home-line')?.textContent).toContain('daily.homeLine.above');
      expect(q('home-start')?.textContent).toContain('daily.homeLine.above');
      expect(q('home-remaining')).toBeNull();
      expect(q('welcome-record')).toBeNull();
    });

    it('rien à dire : le libellé par défaut, sans phrase', () => {
      const { q } = render({ recap: { ...RECAP, yesterdayScore: 2000 } });
      expect(q('home-line')).toBeNull();
      expect(q('home-start')?.textContent).toContain('daily.homeLine.default');
    });

    it('sans récap, ou en pause, ou au premier jeu : la carte d\'avant', () => {
      expect(render().q('home-start')?.textContent).toContain('daily.welcome.start');
      expect(render({ recap: RECAP, completedCount: 2 }).q('home-start')?.textContent).toContain('daily.resume.resume');
      expect(render({ recap: RECAP, firstGame: true }).q('home-line')).toBeNull();
    });
  });
});
