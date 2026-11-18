import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { RunLevel } from '../../domain/run';
import { RunInactivityAlertComponent, showsInactivityAlert } from './run-inactivity-alert.component';

describe('RunInactivityAlertComponent', () => {
  const level = (overrides: Partial<RunLevel> = {}): RunLevel => ({
    points: 2340, disc: { key: 'runs.discs.silver', stars: 0 }, nextDisc: { key: 'runs.discs.gold', stars: 0 }, pointsToNext: 1260,
    progressPercent: 21, runsPlayed: 12, delta: null, discChange: null, inactivityLoss: 0, discDropInDays: 3, ...overrides,
  });

  function render(value: RunLevel | null) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(RunInactivityAlertComponent);
    fixture.componentRef.setInput('level', value);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  const find = (element: HTMLElement, id: string) => element.querySelector<HTMLElement>(`[data-testid="${id}"]`);

  it('annonce la baisse du disque dans la semaine, en cyan, sans lueur', () => {
    const alert = find(render(level()), 'run-inactivity-alert');

    expect(alert).not.toBeNull();
    expect(alert?.classList).not.toContain('tube-amber');
    expect(find(alert!, 'run-inactivity-title')?.textContent?.trim()).toBe('runs.inactivity.title');
  });

  it('« demain » à un jour de la baisse', () => {
    expect(find(render(level({ discDropInDays: 1 })), 'run-inactivity-title')?.textContent?.trim()).toBe('runs.inactivity.titleTomorrow');
  });

  it('rien quand le disque n\'est pas menacé dans la semaine, ou sans niveau', () => {
    expect(find(render(level({ discDropInDays: 8 })), 'run-inactivity-alert')).toBeNull();
    TestBed.resetTestingModule();
    expect(find(render(level({ discDropInDays: null })), 'run-inactivity-alert')).toBeNull();
    TestBed.resetTestingModule();
    expect(find(render(null), 'run-inactivity-alert')).toBeNull();
  });

  it('showsInactivityAlert : de 1 à 7 jours seulement', () => {
    expect([1, 7, 8].map(days => showsInactivityAlert(level({ discDropInDays: days })))).toEqual([true, true, false]);
    expect(showsInactivityAlert(level({ discDropInDays: null }))).toBe(false);
    expect(showsInactivityAlert(null)).toBe(false);
  });
});
