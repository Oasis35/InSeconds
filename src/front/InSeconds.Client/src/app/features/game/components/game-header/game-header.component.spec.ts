import { TestBed, ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { GameHeaderComponent } from './game-header.component';
import { PlayerSessionService } from '../../../../core/services/player-session.service';

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
    fixture.componentRef.setInput('streak', 0);
    fixture.componentRef.setInput('totalScore', 0);
    fixture.componentRef.setInput('currentIndex', 0);
    fixture.componentRef.setInput('trackCount', 3);
  });

  describe('profileInitial()', () => {
    it('returns the uppercase first letter of the pseudo', () => {
      playerSessionStub.pseudo.set('alice');
      expect(component['profileInitial']()).toBe('A');
    });

    it('falls back to "?" when there is no pseudo', () => {
      playerSessionStub.pseudo.set(null);
      expect(component['profileInitial']()).toBe('?');
    });
  });

  it('emits abandon on demand', () => {
    const spy = jasmine.createSpy('abandon');
    component.abandon.subscribe(spy);

    component.abandon.emit();

    expect(spy).toHaveBeenCalled();
  });
});
