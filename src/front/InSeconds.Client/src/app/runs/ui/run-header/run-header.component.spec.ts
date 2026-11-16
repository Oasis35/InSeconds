import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import fr from '../../../../../public/i18n/fr.json';
import { RunHeaderComponent } from './run-header.component';

describe('RunHeaderComponent', () => {
  function render(lives: boolean[] = [true, true, false], round = 2, listenSeconds: number | null = 5, theme: string | null = null) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    TestBed.inject(TranslateService).setTranslation('fr', fr);
    TestBed.inject(TranslateService).use('fr');
    const fixture = TestBed.createComponent(RunHeaderComponent);
    fixture.componentRef.setInput('round', round);
    fixture.componentRef.setInput('lives', lives);
    fixture.componentRef.setInput('listenSeconds', listenSeconds);
    fixture.componentRef.setInput('theme', theme);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('un cœur par vie de départ : plein pour celle qui reste, vide pour celle qui est perdue', () => {
    const { element } = render();

    const hearts = [...element.querySelectorAll('[data-testid="run-lives"] svg')];
    expect(hearts.map(h => h.getAttribute('data-alive'))).toEqual(['true', 'true', 'false']);
    expect(element.querySelector('[data-testid="run-lives"]')?.getAttribute('aria-label')).toBe('Vies : 2 sur 3');
  });

  it('« Manche 2 », le thème et le palier d\'écoute, sans score total', () => {
    const { element } = render([true, true, true], 2, 5, 'Années 80');

    expect(element.querySelector('[data-testid="run-round-title"]')?.textContent?.replace(/\s+/g, ' ').trim()).toBe('Manche 2 Années 80');
    expect(element.querySelector('[data-testid="run-theme-pill"]')?.textContent?.trim()).toBe('Années 80');
    expect(element.querySelector('[data-testid="run-listen"]')?.textContent?.trim()).toMatch(/^Écoute 5\s*s$/);
    expect(element.querySelector('[data-testid="run-total-score"]')).toBeNull();
  });

  it('sans palier ni thème, rien de plus que le titre', () => {
    const { element } = render([true, true, true], 1, null, null);

    expect(element.querySelector('[data-testid="run-listen"]')).toBeNull();
    expect(element.querySelector('[data-testid="run-theme-pill"]')).toBeNull();
  });

  it('l\'écran de bilan et celui du thème ne montrent que les vies', () => {
    const { fixture, element } = render();
    fixture.componentRef.setInput('showStatus', false);
    fixture.detectChanges();

    expect(element.querySelector('[data-testid="run-round-title"]')).toBeNull();
    expect(element.querySelector('[data-testid="run-lives"]')).not.toBeNull();
  });

  it('✕ est un bouton nommé qui demande l\'abandon à la page', () => {
    const { fixture, element } = render();
    const abandon = vi.fn();
    fixture.componentInstance.abandon.subscribe(abandon);

    const button = element.querySelector('[data-testid="run-abandon"]') as HTMLButtonElement;
    expect(button.getAttribute('aria-label')).toBe('Abandonner');
    button.click();

    expect(abandon).toHaveBeenCalledTimes(1);
  });

  it('le titre de la manche est le seul titre de la page', () => {
    expect(render().element.querySelectorAll('h1')).toHaveLength(1);
  });

  it('le haut-parleur coupe ou remet les sons, son libellé suit', () => {
    const { fixture, element } = render();
    const toggled = vi.fn();
    fixture.componentInstance.toggleSounds.subscribe(toggled);
    const button = element.querySelector<HTMLButtonElement>('[data-testid="run-sounds"]')!;
    expect(button.getAttribute('aria-label')).toBe('Couper les sons');

    button.click();
    fixture.componentRef.setInput('muted', true);
    fixture.detectChanges();

    expect(toggled).toHaveBeenCalledTimes(1);
    expect(button.getAttribute('aria-label')).toBe('Remettre les sons');
    // Le libellé dit l'action : pas d'`aria-pressed` en plus (« Remettre les sons, enfoncé » se contredirait).
    expect(button.hasAttribute('aria-pressed')).toBe(false);
  });
});
