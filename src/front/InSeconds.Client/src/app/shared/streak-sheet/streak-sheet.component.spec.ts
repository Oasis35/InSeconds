import { TestBed, ComponentFixture } from '@angular/core/testing';
import { signal } from '@angular/core';
import { provideTranslateService } from '@ngx-translate/core';
import { StreakSheetComponent } from './streak-sheet.component';
import { LanguageService } from '../../core/services/language.service';
import { StreakDto } from '../../core/models/game.models';

function buildStreak(overrides: Partial<StreakDto> = {}): StreakDto {
  return {
    status: 'active', streak: 12, freezes: 2, maxFreezes: 2, freezeEveryDays: 7,
    nextFreezeInDays: 2, missedDays: 0, lostStreak: undefined, lastPlayedDate: undefined,
    ...overrides,
  };
}

describe('StreakSheetComponent', () => {
  let fixture: ComponentFixture<StreakSheetComponent>;
  let component: StreakSheetComponent;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [StreakSheetComponent],
      providers: [
        provideTranslateService(),
        { provide: LanguageService, useValue: { current: signal('fr') } },
      ],
    });
    fixture = TestBed.createComponent(StreakSheetComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('streak', buildStreak());
    fixture.componentRef.setInput('linked', true);
  });

  const variantAttr = () =>
    (fixture.nativeElement as HTMLElement).querySelector('[data-testid="streak-sheet"]')?.getAttribute('data-variant');

  it('renders the linked variant for an active linked streak', () => {
    fixture.detectChanges();
    expect(variantAttr()).toBe('linked');
  });

  it('renders the protected variant when a freeze covers the missed day', () => {
    fixture.componentRef.setInput('streak', buildStreak({ status: 'protected', missedDays: 1 }));
    fixture.detectChanges();
    expect(variantAttr()).toBe('protected');
  });

  it('renders the guest variant for a guest, whatever the status', () => {
    fixture.componentRef.setInput('linked', false);
    fixture.componentRef.setInput('streak', buildStreak({ status: 'protected' }));
    fixture.detectChanges();
    expect(variantAttr()).toBe('guest');
  });

  it('computes the next freeze milestone and the progress toward it', () => {
    expect(component['nextFreezeAt']()).toBe(14);
    expect(component['remaining']()).toBe(2);
    expect(component['progressPercent']()).toBe(71);
    expect(component['remainingKey']()).toBe('streakFreeze.sheet.remaining.other');
  });

  it('shows an empty progress bar right after a freeze was earned', () => {
    fixture.componentRef.setInput('streak', buildStreak({ streak: 14, nextFreezeInDays: 7 }));
    expect(component['progressPercent']()).toBe(0);
  });

  it('builds the frieze: last played days, frozen days, then today', () => {
    fixture.componentRef.setInput('streak', buildStreak({
      status: 'protected', missedDays: 1, lastPlayedDate: '2026-09-22' as unknown as Date,
    }));

    const days = component['friezeDays']();

    expect(days.map(d => d.kind)).toEqual(['played', 'played', 'freeze', 'today']);
    expect(days[0].label).toBe('lun'); // 21/09/2026
    expect(days[1].label).toBe('mar'); // 22/09/2026
  });

  it('shows a single played day when the streak is 1', () => {
    fixture.componentRef.setInput('streak', buildStreak({
      streak: 1, status: 'protected', missedDays: 2, lastPlayedDate: '2026-09-20' as unknown as Date,
    }));

    expect(component['friezeDays']().map(d => d.kind)).toEqual(['played', 'freeze', 'freeze', 'today']);
  });

  it('closes on backdrop click but not on a click inside the panel', () => {
    const spy = jasmine.createSpy('closed');
    component.closed.subscribe(spy);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;

    (root.querySelector('[data-testid="streak-sheet"]') as HTMLElement).click();
    expect(spy).not.toHaveBeenCalled();

    (root.querySelector('button[aria-label]') as HTMLElement).click();
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it('closes on Escape', () => {
    const spy = jasmine.createSpy('closed');
    component.closed.subscribe(spy);
    fixture.detectChanges();

    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(spy).toHaveBeenCalled();
  });
});
