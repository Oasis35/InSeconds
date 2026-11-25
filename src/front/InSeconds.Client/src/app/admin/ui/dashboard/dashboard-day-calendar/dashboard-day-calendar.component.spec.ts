import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { DashboardDayCalendarComponent } from './dashboard-day-calendar.component';

describe('DashboardDayCalendarComponent', () => {
  const available = ['2026-11-25', '2026-11-23', '2026-10-31', '2026-10-02'];

  function render(selectedDay: string | null = '2026-11-23') {
    TestBed.configureTestingModule({ imports: [DashboardDayCalendarComponent], providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(DashboardDayCalendarComponent);
    fixture.componentRef.setInput('selectedDay', selectedDay);
    fixture.componentRef.setInput('availableDays', available);
    fixture.componentRef.setInput('locale', 'fr');
    const selected: string[] = [];
    fixture.componentInstance.daySelected.subscribe(day => selected.push(day));
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const byId = (id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`)!;
    const dayButtons = () => Array.from(element.querySelectorAll<HTMLElement>('[data-testid="calendar-day"]')).map(b => b.textContent?.trim());
    return { fixture, element, byId, dayButtons, selected };
  }

  it('s\'ouvre sur le mois du jour affiché, avec un bouton par jour qui a un défi et le jour choisi mis en avant', () => {
    const { byId, dayButtons, element } = render();

    expect(byId('calendar-month').textContent).toContain('Novembre 2026');
    expect(dayButtons()).toEqual(['23', '25']);
    expect(element.querySelectorAll('[data-testid="calendar-day-empty"]')).toHaveLength(28);
    expect(element.querySelector('[aria-pressed="true"]')?.textContent?.trim()).toBe('23');
  });

  it('un clic sur un jour avec défi le donne ; ‹ › changent de mois dans les bornes', () => {
    const { fixture, byId, dayButtons, selected } = render();
    expect(byId('calendar-next').hasAttribute('disabled')).toBe(true);

    byId('calendar-previous').click();
    fixture.detectChanges();
    expect(byId('calendar-month').textContent).toContain('Octobre 2026');
    expect(dayButtons()).toEqual(['2', '31']);
    expect(byId('calendar-previous').hasAttribute('disabled')).toBe(true);

    fixture.nativeElement.querySelectorAll('[data-testid="calendar-day"]')[1].click();
    expect(selected).toEqual(['2026-10-31']);
  });
});
