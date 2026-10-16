import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { Streak } from '../../domain/streak';
import { WelcomeScreenComponent } from './welcome-screen.component';

const PROTECTED: Streak = {
  status: 'protected', streak: 12, freezes: 1, maxFreezes: 2, freezeEveryDays: 7,
  nextFreezeInDays: 2, missedDays: 1, lostStreak: null, lastPlayedDate: null,
};

describe('WelcomeScreenComponent', () => {
  function render(inputs: Record<string, unknown> = {}) {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideTranslateService(), provideRouter([])] });
    const fixture = TestBed.createComponent(WelcomeScreenComponent);
    fixture.componentRef.setInput('trackCount', 3);
    fixture.componentRef.setInput('linked', false);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, text: () => el.textContent ?? '' };
  }

  it('émet startGame au clic sur le bouton de démarrage', () => {
    const { fixture, el } = render();
    const spy = vi.fn();
    fixture.componentInstance.startGame.subscribe(spy);
    el.querySelector('button')!.click();
    expect(spy).toHaveBeenCalled();
  });

  it('invité : propose la connexion, sauf si hideLoginCta', () => {
    expect(render().el.querySelector('a[href="/account/login"]')).not.toBeNull();
    expect(render({ hideLoginCta: true }).el.querySelector('a[href="/account/login"]')).toBeNull();
  });

  it('connecté : lien vers le profil avec le pseudo, pas de CTA de connexion', () => {
    const { el, text } = render({ linked: true, pseudo: 'Léa' });
    expect(el.querySelector('a[href="/account/profile"]')).not.toBeNull();
    expect(el.querySelector('a[href="/account/login"]')).toBeNull();
    expect(text()).toContain('daily.welcome.loggedInAs');
  });

  it('connecté avec une série protégée : ligne de gel et titre bon retour', () => {
    const { el, text } = render({ linked: true, streak: PROTECTED });
    expect(el.querySelector('[data-testid="frozen-line"]')).not.toBeNull();
    expect(text()).toContain('daily.streakFreeze.welcomeBack');
  });

  it('invité avec une série protégée : pas de ligne de gel', () => {
    expect(render({ linked: false, streak: PROTECTED }).el.querySelector('[data-testid="frozen-line"]')).toBeNull();
  });

  it('connecté avec une série active : pas de ligne de gel', () => {
    const { el } = render({ linked: true, streak: { ...PROTECTED, status: 'active', missedDays: 0 } });
    expect(el.querySelector('[data-testid="frozen-line"]')).toBeNull();
  });
});
