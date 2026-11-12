import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { RunLevel, RunRecord, RunShelfDisc } from '../../domain/run';
import { RunWelcomeScreenComponent } from './run-welcome-screen.component';

describe('RunWelcomeScreenComponent', () => {
  function render(inputs: { record?: RunRecord | null; shelf?: RunShelfDisc[]; level?: RunLevel | null } = {}) {
    TestBed.configureTestingModule({ providers: [provideTranslateService(), provideRouter([])] });
    const fixture = TestBed.createComponent(RunWelcomeScreenComponent);
    fixture.componentRef.setInput('record', inputs.record ?? null);
    fixture.componentRef.setInput('shelf', inputs.shelf ?? []);
    fixture.componentRef.setInput('level', inputs.level ?? null);
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

  it('l\'étagère : chaque disque gagné avec son nombre, rien sans disque', () => {
    expect(render().element.querySelector('[data-testid="run-shelf"]')).toBeNull();
    TestBed.resetTestingModule();

    const { element } = render({ shelf: [{ disc: { key: 'runs.discs.wax', stars: 0 }, count: 3 }, { disc: { key: 'runs.discs.gold', stars: 0 }, count: 1 }] });
    const entries = [...element.querySelectorAll('[data-testid="run-shelf"] [data-shelf-disc]')];

    expect(entries.map(e => [e.getAttribute('data-shelf-disc'), e.querySelector('span[aria-hidden]')?.textContent?.trim()]))
      .toEqual([['runs.discs.wax', '×3'], ['runs.discs.gold', '×1']]);
    // Le lecteur d'écran lit le nom du disque et son nombre (texte masqué à l'écran).
    expect(entries[0].querySelector('.sr-only')?.textContent).toContain('runs.welcome.shelfEntry');
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
