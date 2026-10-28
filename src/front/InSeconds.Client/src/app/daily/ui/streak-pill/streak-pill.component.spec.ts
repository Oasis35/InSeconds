import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { EMPTY_STREAK, Streak } from '../../domain/streak';
import { StreakPillComponent } from './streak-pill.component';

const STREAK: Streak = { ...EMPTY_STREAK, streak: 12, freezes: 2, maxFreezes: 2, freezeEveryDays: 7 };

describe('StreakPillComponent', () => {
  @Component({
    imports: [StreakPillComponent],
    template: `<app-streak-pill [streak]="streak" [linked]="linked" (open)="opened = opened + 1" />`,
  })
  class Host {
    streak: Streak | null = STREAK;
    linked = true;
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

  it('mode on : série et gels en texte, sans pastille ni lueur', () => {
    const { button, text } = render();
    expect(button.dataset['mode']).toBe('on');
    expect(text()).toContain('12');
    expect(text()).toContain('2');
    expect(button.querySelectorAll('app-streak-icon')).toHaveLength(2);
    expect(getComputedStyle(button).boxShadow).toBe('none');
    expect(button.style.animation).toBe('');
  });

  it('aucune série en cours : rien à afficher', () => {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.streak = null;
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).querySelector('[data-testid="streak-pill"]')).toBeNull();
  });

  it('mode guest : série sans gels', () => {
    const { button } = render(h => (h.linked = false));
    expect(button.dataset['mode']).toBe('guest');
    expect(button.querySelectorAll('app-streak-icon')).toHaveLength(1);
  });

  it('mode protected : série et gels restants', () => {
    const { button } = render(h => (h.streak = { ...STREAK, status: 'protected', missedDays: 1 }));
    expect(button.dataset['mode']).toBe('protected');
    expect(button.querySelectorAll('app-streak-icon')).toHaveLength(2);
  });

  it('un clic émet open', () => {
    const { fixture, button } = render();
    button.click();
    expect(fixture.componentInstance.opened).toBe(1);
  });
});
