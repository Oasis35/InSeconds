import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { GuestStreakToastComponent } from './guest-streak-toast.component';

describe('GuestStreakToastComponent', () => {
  @Component({
    imports: [GuestStreakToastComponent],
    template: `<app-guest-streak-toast [streak]="streak" [freezeMiss]="freezeMiss" (dismissed)="count = count + 1" />`,
  })
  class Host {
    streak = 3;
    freezeMiss = false;
    count = 0;
  }

  function render(setup: (h: Host) => void = () => {}) {
    TestBed.configureTestingModule({ providers: [provideTranslateService(), provideRouter([])] });
    const fixture = TestBed.createComponent(Host);
    setup(fixture.componentInstance);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, text: () => el.textContent!.replace(/\s+/g, ' ') };
  }

  it('série simple : clés du pluriel et indice, flamme', () => {
    const { text, el } = render();
    expect(text()).toContain('daily.streakToast.body.other');
    expect(text()).toContain('daily.streakToast.hint');
    expect(el.querySelector('[data-testid="guest-streak-toast"]')).not.toBeNull();
  });

  it('série de 1 : clé au singulier', () => {
    expect(render(h => (h.streak = 1)).text()).toContain('daily.streakToast.body.one');
  });

  it('gel manqué : variante « tu aurais gagné un gel »', () => {
    const { text } = render(h => (h.freezeMiss = true));
    expect(text()).toContain('daily.streakFreeze.guestMissToast.title');
    expect(text()).not.toContain('daily.streakToast.body');
  });

  it('le CTA mène à /account/login, en deux lignes', () => {
    const { el } = render();
    const cta = el.querySelector('a')!;
    expect(cta.getAttribute('href')).toBe('/account/login');
    expect(cta.textContent).toContain('daily.streakFreeze.ctaLine1');
    expect(cta.textContent).toContain('daily.streakFreeze.ctaLine2');
  });

  it('le bouton ✕ émet dismissed', () => {
    const { fixture, el } = render();
    el.querySelector<HTMLButtonElement>('button')!.click();
    expect(fixture.componentInstance.count).toBe(1);
  });
});
