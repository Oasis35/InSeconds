import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { RunStatusKind, RunStatusScreenComponent } from './run-status-screen.component';

describe('RunStatusScreenComponent', () => {
  function render(kind: RunStatusKind, errorCode: string | null = null) {
    TestBed.configureTestingModule({ providers: [provideTranslateService(), provideRouter([])] });
    const fixture = TestBed.createComponent(RunStatusScreenComponent);
    fixture.componentRef.setInput('kind', kind);
    fixture.componentRef.setInput('errorCode', errorCode);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it.each<RunStatusKind>(['no_challenge', 'error'])('%s propose de réessayer', kind => {
    const { fixture, element } = render(kind);
    const retry = vi.fn();
    fixture.componentInstance.retry.subscribe(retry);

    (element.querySelector('[data-testid="run-retry"]') as HTMLButtonElement).click();

    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("une erreur montre son code (traceId), à donner au support comme au Daily", () => {
    const { element } = render('error', '00-abc123-01');

    expect(element.querySelector('[data-testid="error-code"]')?.textContent).toContain('00-abc123-01');
  });

  it("sans code, la ligne du code n'apparaît pas", () => {
    const { element } = render('error');

    expect(element.querySelector('[data-testid="error-code"]')).toBeNull();
  });

  it('renvoie toujours vers le jeu du jour', () => {
    const { element } = render('error');

    expect(element.querySelector('a')?.getAttribute('href')).toBe('/daily');
  });
});
