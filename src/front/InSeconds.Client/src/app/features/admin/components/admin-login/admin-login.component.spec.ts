import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { AdminLoginComponent } from './admin-login.component';
import { PlayerSessionService } from '../../../../core/services/player-session.service';

describe('AdminLoginComponent', () => {
  function setup(isLinked: boolean) {
    TestBed.configureTestingModule({
      providers: [{ provide: PlayerSessionService, useValue: { isLinked: signal(isLinked) } }],
    });

    return TestBed.runInInjectionContext(() => new AdminLoginComponent());
  }

  it('exposes isLinked=false for a guest / not-logged-in account', () => {
    const component = setup(false);

    expect(component['isLinked']()).toBe(false);
  });

  it('exposes isLinked=true for a linked but non-admin account', () => {
    const component = setup(true);

    expect(component['isLinked']()).toBe(true);
  });
});
