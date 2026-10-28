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

  it('connecté : ni « Créer un compte » ni lien vers le profil (le profil est dans l’en-tête)', () => {
    const { el } = render({ linked: true });
    expect(el.querySelector('a[href="/account/login"]')).toBeNull();
    expect(el.querySelector('a[href="/account/profile"]')).toBeNull();
  });

  it('connecté avec une série protégée : la ligne du gel sous le relevé, sans titre « bon retour »', () => {
    const { el, text } = render({ linked: true, streak: PROTECTED });
    expect(el.querySelector('[data-testid="frozen-line"]')?.textContent).toContain('daily.streakFreeze.protectedLine.one');
    expect(el.querySelector('[data-testid="streak-pill"]')).not.toBeNull();
    expect(text()).not.toContain('welcomeBack');
  });

  it('montre la date, le record du joueur plutôt que la médiane d’hier', () => {
    const { el } = render({ dateLabel: 'mardi 28 octobre', bestScore: 3200, yesterdayMedian: 1500 });
    expect(el.querySelector('[data-testid="welcome-date"]')?.textContent).toContain('mardi 28 octobre');
    expect(el.querySelector('[data-testid="welcome-record"]')?.textContent).toContain('3200');
    expect(el.querySelector('[data-testid="welcome-target"]')).toBeNull();
  });

  it('sans record : la médiane d’hier en score à battre ; sans l’un ni l’autre : rien', () => {
    const target = render({ yesterdayMedian: 1500 }).el;
    expect(target.querySelector('[data-testid="welcome-target"]')?.textContent).toContain('1500');
    expect(target.querySelector('[data-testid="welcome-record"]')).toBeNull();
    const none = render().el;
    expect(none.querySelector('[data-testid="welcome-target"]')).toBeNull();
    expect(none.querySelector('[data-testid="welcome-record"]')).toBeNull();
  });

  it('donne l’accès aux réponses des jours passés', () => {
    expect(render().el.querySelector('[data-testid="welcome-archive"]')?.getAttribute('href')).toBe('/daily/archive');
  });

  it('invité avec une série protégée : pas de ligne de gel', () => {
    expect(render({ linked: false, streak: PROTECTED }).el.querySelector('[data-testid="frozen-line"]')).toBeNull();
  });

  it('connecté avec une série active : pas de ligne de gel', () => {
    const { el } = render({ linked: true, streak: { ...PROTECTED, status: 'active', missedDays: 0 } });
    expect(el.querySelector('[data-testid="frozen-line"]')).toBeNull();
  });

  it('montre la série sous « Commencer » et émet openStreak au toucher', () => {
    const { fixture, el } = render({ linked: true, streak: { ...PROTECTED, status: 'active', missedDays: 0 } });
    const spy = vi.fn();
    fixture.componentInstance.openStreak.subscribe(spy);

    const pill = el.querySelector<HTMLButtonElement>('[data-testid="streak-pill"]')!;
    expect(pill).not.toBeNull();
    pill.click();
    expect(spy).toHaveBeenCalled();
  });

  it('sans série en cours : pas de relevé de série', () => {
    expect(render().el.querySelector('[data-testid="streak-pill"]')).toBeNull();
  });
});
