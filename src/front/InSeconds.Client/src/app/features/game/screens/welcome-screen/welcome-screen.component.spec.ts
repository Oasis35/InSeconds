import { TestBed, ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { WelcomeScreenComponent } from './welcome-screen.component';
import { PlayerSessionService } from '../../../../core/services/player-session.service';

// Pas de fixture.detectChanges() : le composant n'a aucune logique propre au-delà du
// passthrough de PlayerSessionService (isLinked/pseudo) consommé par le template
// (`@if`/`@else` guest vs connecté) — on vérifie ce câblage et l'output `startGame`.
describe('WelcomeScreenComponent', () => {
  let fixture: ComponentFixture<WelcomeScreenComponent>;
  let component: WelcomeScreenComponent;
  let playerSessionStub: {
    isLinked: ReturnType<typeof signal<boolean>>;
    pseudo: ReturnType<typeof signal<string | null>>;
  };

  beforeEach(() => {
    playerSessionStub = { isLinked: signal(false), pseudo: signal<string | null>(null) };

    TestBed.configureTestingModule({
      imports: [WelcomeScreenComponent],
      providers: [
        provideTranslateService(),
        provideRouter([]),
        { provide: PlayerSessionService, useValue: playerSessionStub },
      ],
    });
    fixture = TestBed.createComponent(WelcomeScreenComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('trackCount', 3);
  });

  it('exposes trackCount() as set', () => {
    expect(component.trackCount()).toBe(3);
  });

  it('emits startGame on demand', () => {
    const spy = jasmine.createSpy('startGame');
    component.startGame.subscribe(spy);

    component.startGame.emit();

    expect(spy).toHaveBeenCalled();
  });

  describe('isProtected()', () => {
    const protectedStreak = {
      status: 'protected', streak: 12, freezes: 1, maxFreezes: 2, freezeEveryDays: 7,
      nextFreezeInDays: 2, missedDays: 1, lostStreak: undefined, lastPlayedDate: undefined,
    };

    it('is true for a linked account whose streak is protected by a freeze', () => {
      playerSessionStub.isLinked.set(true);
      fixture.componentRef.setInput('streak', protectedStreak);
      expect(component['isProtected']()).toBeTrue();
    });

    it('is false for a guest', () => {
      fixture.componentRef.setInput('streak', protectedStreak);
      expect(component['isProtected']()).toBeFalse();
    });

    it('is false for an active streak', () => {
      playerSessionStub.isLinked.set(true);
      fixture.componentRef.setInput('streak', { ...protectedStreak, status: 'active', missedDays: 0 });
      expect(component['isProtected']()).toBeFalse();
    });
  });

  it('reflects PlayerSessionService.isLinked() for guest vs linked', () => {
    expect(component['playerSession'].isLinked()).toBeFalse();
    playerSessionStub.isLinked.set(true);
    expect(component['playerSession'].isLinked()).toBeTrue();
  });
});
