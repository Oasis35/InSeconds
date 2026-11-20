import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { DayHistory } from '../../domain/daily';
import { GameProfileCardComponent, gameProfileLine } from './game-profile-card.component';

const HISTORY = (over: Partial<DayHistory> = {}): DayHistory => ({
  fastestSeconds: 1, fastestFoundPercent: null, previousGames: 8, previousBestScore: 3500, previousAverageScore: 2180,
  averageScoreAfter: 2205, bestSinceDays: 9, firstStepSeconds: 0.5, firstStepFoundTotal: 12, firstStepFoundToday: 1, ...over,
});

describe('GameProfileCardComponent', () => {
  it('dit ce que la partie change : première, record, meilleur depuis, ou écart à la moyenne', () => {
    expect(gameProfileLine(HISTORY({ previousGames: 0 }), 2000)).toEqual({ kind: 'first' });
    expect(gameProfileLine(HISTORY({ bestSinceDays: null }), 3700)).toEqual({ kind: 'record', above: 200 });
    expect(gameProfileLine(HISTORY(), 2410)).toEqual({ kind: 'bestSince', days: 9 });
    expect(gameProfileLine(HISTORY({ bestSinceDays: 1 }), 2000)).toEqual({ kind: 'average', diff: -180 });
  });

  function render(history = HISTORY(), score = 2410) {
    TestBed.configureTestingModule({ imports: [GameProfileCardComponent], providers: [provideRouter([]), provideTranslateService()] });
    const fixture = TestBed.createComponent(GameProfileCardComponent);
    fixture.componentRef.setInput('history', history);
    fixture.componentRef.setInput('score', score);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('mène au profil, avec sa moyenne après la partie et ses trouvés en 0,5 s', () => {
    const el = render();

    expect(el.querySelector('[data-testid="game-profile-card"]')?.getAttribute('href')).toBe('/history/daily/profil');
    expect(el.querySelector('[data-testid="game-profile-line"]')?.textContent).toBe('daily.profile.line.bestSince');
    expect(el.querySelector('[data-testid="game-profile-average"]')?.textContent?.replace(/\s/g, '')).toContain('+25');
    expect(el.querySelector('[data-testid="game-profile-first-step"]')?.textContent).toContain('12');
  });

  it('à la première partie, pas encore de chiffres', () => {
    const el = render(HISTORY({ previousGames: 0, previousAverageScore: null, previousBestScore: null, bestSinceDays: null }));

    expect(el.querySelector('[data-testid="game-profile-line"]')?.textContent).toBe('daily.profile.line.first');
    expect(el.querySelector('[data-testid="game-profile-average"]')).toBeNull();
  });
});
