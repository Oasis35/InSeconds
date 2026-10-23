import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { RunHeaderComponent } from './run-header.component';

describe('RunHeaderComponent', () => {
  function render() {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(RunHeaderComponent);
    fixture.componentRef.setInput('round', 2);
    fixture.componentRef.setInput('rounds', 4);
    fixture.componentRef.setInput('score', 600);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('montre la manche, le nombre de manches et le score total', () => {
    const { element } = render();

    expect(element.querySelector('[data-testid="run-round-title"]')?.textContent).toContain('runs.header.round');
    expect(element.querySelector('[data-testid="run-total-score"]')?.textContent?.trim()).toBe('600');
  });

  it('« Abandonner » est un bouton qui le demande à la page', () => {
    const { fixture, element } = render();
    const abandon = vi.fn();
    fixture.componentInstance.abandon.subscribe(abandon);

    (element.querySelector('[data-testid="run-abandon"]') as HTMLButtonElement).click();

    expect(abandon).toHaveBeenCalledTimes(1);
  });

  it('le titre de la manche est le seul titre de la page', () => {
    const { element } = render();

    expect(element.querySelectorAll('h1')).toHaveLength(1);
  });
});
