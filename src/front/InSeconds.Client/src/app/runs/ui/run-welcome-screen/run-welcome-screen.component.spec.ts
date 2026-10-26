import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { RunRecord } from '../../domain/run';
import { RunWelcomeScreenComponent } from './run-welcome-screen.component';

describe('RunWelcomeScreenComponent', () => {
  function render(inputs: { record?: RunRecord | null } = {}) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(RunWelcomeScreenComponent);
    fixture.componentRef.setInput('record', inputs.record ?? null);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it("propose de lancer une partie, sans record tant qu'il n'y en a pas", () => {
    const { element } = render();

    expect(element.querySelector('[data-testid="run-start"]')?.textContent).toContain('runs.welcome.launch');
    expect(element.querySelector('[data-testid="run-record"]')).toBeNull();
  });

  it('montre le record du joueur', () => {
    const { element } = render({ record: { bestScore: 900, bestRoundsPassed: 2, isNew: false } });

    expect(element.querySelector('[data-testid="run-record"]')).not.toBeNull();
  });

  it("le bouton lance le mode (c'est le clic qui déverrouille le son)", () => {
    const { fixture, element } = render();
    const start = vi.fn();
    fixture.componentInstance.start.subscribe(start);

    (element.querySelector('[data-testid="run-start"]') as HTMLButtonElement).click();

    expect(start).toHaveBeenCalledTimes(1);
  });
});
