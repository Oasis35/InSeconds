import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { RunThemeScreenComponent } from './run-theme-screen.component';

describe('RunThemeScreenComponent', () => {
  let fixture: ComponentFixture<RunThemeScreenComponent>;
  const el = (): HTMLElement => fixture.nativeElement;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideTranslateService(), provideRouter([])] });
    fixture = TestBed.createComponent(RunThemeScreenComponent);
    fixture.componentRef.setInput('offer', [{ id: 1, name: 'Années 80', round: 3 }, { id: 2, name: 'Rap français', round: 3 }]);
    fixture.componentRef.setInput('choice', 1);
    fixture.detectChanges();
  });

  it('montre les deux thèmes et « Surprise », celui qui est choisi est coché', () => {
    const tiles = el().querySelectorAll('[role="radio"]');
    expect(tiles.length).toBe(3);
    expect(el().textContent).toContain('Années 80');
    expect(el().textContent).toContain('Rap français');
    expect(Array.from(tiles).map(t => t.getAttribute('aria-checked'))).toEqual(['true', 'false', 'false']);
  });

  it('« Surprise » est coché quand aucun thème ne l\'est', () => {
    fixture.componentRef.setInput('choice', null);
    fixture.detectChanges();
    expect(el().querySelector('[data-theme-id="surprise"]')?.getAttribute('aria-checked')).toBe('true');
  });

  it('un toucher choisit le thème, « Lancer » lance', () => {
    const chosen: (number | null)[] = [];
    let started = 0;
    fixture.componentInstance.choose.subscribe(v => chosen.push(v));
    fixture.componentInstance.start.subscribe(() => started++);
    (el().querySelector('[data-theme-id="2"]') as HTMLElement).click();
    (el().querySelector('[data-theme-id="surprise"]') as HTMLElement).click();
    (el().querySelector('[data-testid="run-theme-start"]') as HTMLElement).click();
    expect(chosen).toEqual([2, null]);
    expect(started).toBe(1);
  });
});
