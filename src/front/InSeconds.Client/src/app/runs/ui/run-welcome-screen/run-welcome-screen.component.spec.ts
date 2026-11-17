import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { RunLevel, RunRecord } from '../../domain/run';
import { RunWelcomeScreenComponent } from './run-welcome-screen.component';

describe('RunWelcomeScreenComponent', () => {
  function render(inputs: { record?: RunRecord | null; level?: RunLevel | null; overlay?: boolean } = {}) {
    TestBed.configureTestingModule({ providers: [provideTranslateService(), provideRouter([])] });
    const fixture = TestBed.createComponent(RunWelcomeScreenComponent);
    fixture.componentRef.setInput('record', inputs.record ?? null);
    fixture.componentRef.setInput('level', inputs.level ?? null);
    fixture.componentRef.setInput('overlay', inputs.overlay ?? false);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it("propose de lancer une partie, sans record tant qu'il n'y en a pas", () => {
    const { element } = render();

    expect(element.querySelector('[data-testid="run-start"]')?.textContent).toContain('runs.welcome.launch');
    expect(element.querySelector('[data-testid="run-record"]')).toBeNull();
  });

  it('la carte du niveau dans la nouvelle interface, rien sans niveau', () => {
    expect(render().element.querySelector('[data-testid="run-level"]')).toBeNull();
    TestBed.resetTestingModule();

    const { element } = render({ level: { points: 1380, disc: { key: 'runs.discs.silver', stars: 0 }, nextDisc: null, pointsToNext: null, progressPercent: 100, provisional: false, runsPlayed: 12, delta: null } });

    expect(element.querySelector('[data-testid="run-level"]')?.getAttribute('data-disc')).toBe('runs.discs.silver');
    expect(element.querySelector('[data-testid="run-level-review"]')).toBeNull();
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

  it("sous la nouvelle interface, « Commencer » recouvre le cadre de la partie (les vies, floues derrière)", () => {
    const { element } = render({ overlay: true });

    expect(element.querySelector('[data-testid="run-start"]')?.textContent).toContain('runs.welcome.begin');
    expect(element.querySelectorAll('[data-testid="run-lives"] svg')).toHaveLength(3);
  });

  it('sans la nouvelle interface, aucun cadre derrière', () => {
    expect(render().element.querySelector('[data-testid="run-lives"]')).toBeNull();
  });
});
