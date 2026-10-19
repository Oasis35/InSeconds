import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { EMPTY_STREAK, Streak } from '../../domain/streak';
import { StreakPillComponent } from './streak-pill.component';

const STREAK: Streak = { ...EMPTY_STREAK, streak: 12, freezes: 2, maxFreezes: 2, freezeEveryDays: 7 };

describe('StreakPillComponent', () => {
  @Component({
    imports: [StreakPillComponent],
    template: `<app-streak-pill [streak]="streak" [linked]="linked" [pulse]="pulse" (open)="opened = opened + 1" />`,
  })
  class Host {
    streak: Streak | null = STREAK;
    linked = true;
    pulse = false;
    opened = 0;
  }

  function render(setup: (host: Host) => void = () => {}) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(Host);
    setup(fixture.componentInstance);
    fixture.detectChanges();
    const button = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('[data-testid="streak-pill"]')!;
    return { fixture, button, text: () => button.textContent!.replace(/\s+/g, ' ').trim() };
  }

  it('mode on : série et gels, sans animation', () => {
    const { button, text } = render();
    expect(button.dataset['mode']).toBe('on');
    expect(text()).toContain('12');
    expect(text()).toContain('2');
    expect(button.hasAttribute('data-anim')).toBe(false);
  });

  it('mode lost : aucune série, flèche grise à 0', () => {
    const { button, text } = render(h => (h.streak = null));
    expect(button.dataset['mode']).toBe('lost');
    expect(text()).toBe('0');
  });

  it('mode guest : série sans gels', () => {
    const { button } = render(h => (h.linked = false));
    expect(button.dataset['mode']).toBe('guest');
    expect(button.querySelectorAll('app-streak-icon')).toHaveLength(1);
  });

  it('mode protected : pulse permanent', () => {
    const { button } = render(h => (h.streak = { ...STREAK, status: 'protected', missedDays: 1 }));
    expect(button.dataset['mode']).toBe('protected');
    expect(button.style.animation).toContain('gel-pulse');
  });

  it('pulse demandé : animation en mode on', () => {
    const { button } = render(h => (h.pulse = true));
    expect(button.style.animation).toContain('gel-pulse');
    expect(button.hasAttribute('data-anim')).toBe(true);
  });

  it('pulse ignoré pour un invité', () => {
    const { button } = render(h => { h.linked = false; h.pulse = true; });
    expect(button.hasAttribute('data-anim')).toBe(false);
  });

  it('un clic émet open', () => {
    const { fixture, button } = render();
    button.click();
    expect(fixture.componentInstance.opened).toBe(1);
  });
});
