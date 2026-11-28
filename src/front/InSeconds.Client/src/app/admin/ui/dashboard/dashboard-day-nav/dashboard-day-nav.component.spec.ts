import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideTranslateService } from '@ngx-translate/core';
import { DashboardDayCalendarComponent } from '../dashboard-day-calendar/dashboard-day-calendar.component';
import { DashboardDayNavComponent } from './dashboard-day-nav.component';

describe('DashboardDayNavComponent', () => {
  function render(inputs: Partial<{
    day: string | null; locale: string; isToday: boolean; canGoToPrevious: boolean; canGoToNext: boolean; availableDays: readonly string[];
  }> = {}) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(DashboardDayNavComponent);
    fixture.componentRef.setInput('day', inputs.day === undefined ? '2026-11-20' : inputs.day);
    fixture.componentRef.setInput('locale', inputs.locale ?? 'fr');
    for (const name of ['isToday', 'canGoToPrevious', 'canGoToNext', 'availableDays'] as const) {
      if (inputs[name] !== undefined) fixture.componentRef.setInput(name, inputs[name]);
    }
    const emitted = { previous: vi.fn(), next: vi.fn(), daySelected: vi.fn() };
    fixture.componentInstance.previous.subscribe(emitted.previous);
    fixture.componentInstance.next.subscribe(emitted.next);
    fixture.componentInstance.daySelected.subscribe(emitted.daySelected);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const byLabel = (key: string) => element.querySelector<HTMLButtonElement>(`button[aria-label="${key}"]`)!;
    const toggle = () => element.querySelector<HTMLButtonElement>('[data-testid="day-picker-toggle"]')!;
    const calendar = () => fixture.debugElement.query(By.directive(DashboardDayCalendarComponent));
    return { fixture, element, emitted, byLabel, toggle, calendar,
      selectedDay: () => element.querySelector('[data-testid="dashboard-selected-day"]')!.textContent!.replace(/\s+/g, ' ').trim() };
  }

  it('affiche le jour en toutes lettres, dans la langue demandée', () => {
    const fr = render({ day: '2026-11-20', locale: 'fr' }).toggle().textContent!;
    expect(fr.toLowerCase()).toContain('vendredi');
    expect(fr.toLowerCase()).toContain('novembre');
    expect(fr).toMatch(/\b20\b/);

    TestBed.resetTestingModule();
    const en = render({ day: '2026-11-20', locale: 'en' }).toggle().textContent!;
    expect(en.toLowerCase()).toContain('friday');
    expect(en.toLowerCase()).toContain('november');
  });

  it('sans jour, aucune date écrite', () => {
    expect(render({ day: null }).toggle().textContent!.replace('▾', '').trim()).toBe('');
  });

  it('aujourd\'hui : « en direct » ; un autre jour : sa date aaaa-mm-jj', () => {
    expect(render({ isToday: true }).selectedDay()).toContain('admin.dashboard.todayLive');

    TestBed.resetTestingModule();
    const past = render({ day: '2026-11-18', isToday: false }).selectedDay();
    expect(past).toContain('2026-11-18');
    expect(past).not.toContain('admin.dashboard.todayLive');
  });

  describe('jour précédent et suivant', () => {
    it('émettent au clic quand ils sont permis', () => {
      const { byLabel, emitted } = render({ canGoToPrevious: true, canGoToNext: true });

      byLabel('admin.dashboard.previousDay').click();
      byLabel('admin.dashboard.nextDay').click();
      expect(emitted.previous).toHaveBeenCalledTimes(1);
      expect(emitted.next).toHaveBeenCalledTimes(1);
    });

    it('sont grisés, et muets, hors des jours qui ont un défi', () => {
      const { byLabel, emitted } = render({ canGoToPrevious: false, canGoToNext: false });

      expect(byLabel('admin.dashboard.previousDay').disabled).toBe(true);
      expect(byLabel('admin.dashboard.nextDay').disabled).toBe(true);
      byLabel('admin.dashboard.previousDay').click();
      byLabel('admin.dashboard.nextDay').click();
      expect(emitted.previous).not.toHaveBeenCalled();
      expect(emitted.next).not.toHaveBeenCalled();
    });

    it('chaque sens se permet à part (le jour le plus récent n\'a pas de suivant)', () => {
      const { byLabel } = render({ canGoToPrevious: true, canGoToNext: false });

      expect(byLabel('admin.dashboard.previousDay').disabled).toBe(false);
      expect(byLabel('admin.dashboard.nextDay').disabled).toBe(true);
    });
  });

  describe('calendrier', () => {
    it('fermé d\'office, il s\'ouvre et se ferme au clic sur la date, et le bouton le dit', () => {
      const { fixture, toggle, calendar } = render({ availableDays: ['2026-11-20'] });

      expect(calendar()).toBeNull();
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
      toggle().click();
      fixture.detectChanges();
      expect(calendar()).not.toBeNull();
      expect(toggle().getAttribute('aria-expanded')).toBe('true');
      toggle().click();
      fixture.detectChanges();
      expect(calendar()).toBeNull();
    });

    it('reçoit le jour affiché, les jours qui ont un défi et la langue', () => {
      const { fixture, toggle, calendar } = render({ day: '2026-11-20', locale: 'en', availableDays: ['2026-11-19', '2026-11-20'] });
      toggle().click();
      fixture.detectChanges();

      const instance = calendar().componentInstance as DashboardDayCalendarComponent;
      expect(instance.selectedDay()).toBe('2026-11-20');
      expect(instance.availableDays()).toEqual(['2026-11-19', '2026-11-20']);
      expect(instance.locale()).toBe('en');
    });

    it('choisir un jour le renvoie et referme le calendrier', () => {
      const { fixture, toggle, calendar, emitted } = render({ availableDays: ['2026-11-19', '2026-11-20'] });
      toggle().click();
      fixture.detectChanges();

      (calendar().componentInstance as DashboardDayCalendarComponent).daySelected.emit('2026-11-19');
      fixture.detectChanges();

      expect(emitted.daySelected).toHaveBeenCalledWith('2026-11-19');
      expect(calendar()).toBeNull();
      expect(toggle().getAttribute('aria-expanded')).toBe('false');
    });
  });
});
