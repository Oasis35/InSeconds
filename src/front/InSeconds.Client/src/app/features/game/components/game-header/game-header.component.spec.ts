import { TestBed, ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { GameHeaderComponent } from './game-header.component';
import { PlayerSessionService } from '../../../../core/services/player-session.service';
import { StreakDto } from '../../../../core/models/game.models';

function buildStreak(overrides: Partial<StreakDto> = {}): StreakDto {
  return {
    status: 'active', streak: 12, freezes: 2, maxFreezes: 2, freezeEveryDays: 7,
    nextFreezeInDays: 2, missedDays: 0, lostStreak: undefined, lastPlayedDate: undefined,
    ...overrides,
  };
}

describe('GameHeaderComponent', () => {
  let fixture: ComponentFixture<GameHeaderComponent>;
  let component: GameHeaderComponent;
  let playerSessionStub: {
    isLinked: ReturnType<typeof signal<boolean>>;
    pseudo: ReturnType<typeof signal<string | null>>;
  };

  beforeEach(() => {
    playerSessionStub = { isLinked: signal(true), pseudo: signal<string | null>('Alice') };

    TestBed.configureTestingModule({
      imports: [GameHeaderComponent],
      providers: [
        provideTranslateService(),
        provideRouter([]),
        { provide: PlayerSessionService, useValue: playerSessionStub },
      ],
    });
    fixture = TestBed.createComponent(GameHeaderComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('playing', false);
    fixture.componentRef.setInput('showStreak', false);
    fixture.componentRef.setInput('streak', null);
    fixture.componentRef.setInput('totalScore', 0);
    fixture.componentRef.setInput('currentIndex', 0);
    fixture.componentRef.setInput('trackCount', 3);
  });

  describe('pillMode()', () => {
    it('is "lost" when there is no streak', () => {
      fixture.componentRef.setInput('streak', buildStreak({ streak: 0, status: 'broken' }));
      expect(component['pillMode']()).toBe('lost');
    });

    it('is "lost" before the peek answered', () => {
      expect(component['pillMode']()).toBe('lost');
    });

    it('is "guest" for a guest with a streak', () => {
      playerSessionStub.isLinked.set(false);
      fixture.componentRef.setInput('streak', buildStreak({ freezes: 0, maxFreezes: 0 }));
      expect(component['pillMode']()).toBe('guest');
    });

    it('is "protected" for a linked account whose missed day is covered', () => {
      fixture.componentRef.setInput('streak', buildStreak({ status: 'protected', missedDays: 1 }));
      expect(component['pillMode']()).toBe('protected');
    });

    it('is "on" for a linked account with an active streak', () => {
      fixture.componentRef.setInput('streak', buildStreak());
      expect(component['pillMode']()).toBe('on');
    });
  });

  describe('pillAnimation()', () => {
    it('pulses a protected streak', () => {
      fixture.componentRef.setInput('streak', buildStreak({ status: 'protected' }));
      expect(component['pillAnimation']()).toContain('gel-pulse');
    });

    it('pulses the linked pill only when asked (freeze just earned)', () => {
      fixture.componentRef.setInput('streak', buildStreak());
      expect(component['pillAnimation']()).toBeNull();

      fixture.componentRef.setInput('pulse', true);
      expect(component['pillAnimation']()).toContain('gel-pulse');
    });
  });

  it('emits openStreak on demand', () => {
    const spy = jasmine.createSpy('openStreak');
    component.openStreak.subscribe(spy);

    component.openStreak.emit();

    expect(spy).toHaveBeenCalled();
  });

  it('emits abandon on demand', () => {
    const spy = jasmine.createSpy('abandon');
    component.abandon.subscribe(spy);

    component.abandon.emit();

    expect(spy).toHaveBeenCalled();
  });
});
