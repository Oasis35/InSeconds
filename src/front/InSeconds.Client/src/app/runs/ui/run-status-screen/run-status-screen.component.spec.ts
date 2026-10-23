import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { RunStatusKind, RunStatusScreenComponent } from './run-status-screen.component';

describe('RunStatusScreenComponent', () => {
  function render(kind: RunStatusKind) {
    TestBed.configureTestingModule({ providers: [provideTranslateService(), provideRouter([])] });
    const fixture = TestBed.createComponent(RunStatusScreenComponent);
    fixture.componentRef.setInput('kind', kind);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('sans accès, dit que le mode est réservé et ne propose pas de réessayer', () => {
    const { element } = render('access_denied');

    expect(element.textContent).toContain('runs.status.access_denied.title');
    expect(element.querySelector('[data-testid="run-retry"]')).toBeNull();
  });

  it.each<RunStatusKind>(['no_challenge', 'error'])('%s propose de réessayer', kind => {
    const { fixture, element } = render(kind);
    const retry = vi.fn();
    fixture.componentInstance.retry.subscribe(retry);

    (element.querySelector('[data-testid="run-retry"]') as HTMLButtonElement).click();

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('renvoie toujours vers le jeu du jour', () => {
    const { element } = render('error');

    expect(element.querySelector('a')?.getAttribute('href')).toBe('/daily');
  });
});
