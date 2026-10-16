import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { LostStreakToastComponent } from './lost-streak-toast.component';

describe('LostStreakToastComponent', () => {
  @Component({
    imports: [LostStreakToastComponent],
    template: `<app-lost-streak-toast [lostStreak]="9" (dismissed)="count = count + 1" />`,
  })
  class Host {
    count = 0;
  }

  function render() {
    TestBed.configureTestingModule({ providers: [provideTranslateService(), provideRouter([])] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    return { fixture, el, text: () => el.textContent!.replace(/\s+/g, ' ') };
  }

  it('affiche la série perdue barrée et l\'indice', () => {
    const { el, text } = render();
    expect(el.querySelector('[data-testid="lost-streak-toast"]')).not.toBeNull();
    expect(el.querySelector('s')!.textContent).toContain('daily.streakFreeze.lostToast.titleStrike');
    expect(text()).toContain('daily.streakFreeze.lostToast.hintBefore');
  });

  it('le CTA mène à /account/login', () => {
    expect(render().el.querySelector('a')!.getAttribute('href')).toBe('/account/login');
  });

  it('le bouton ✕ émet dismissed', () => {
    const { fixture, el } = render();
    el.querySelector<HTMLButtonElement>('button')!.click();
    expect(fixture.componentInstance.count).toBe(1);
  });
});
