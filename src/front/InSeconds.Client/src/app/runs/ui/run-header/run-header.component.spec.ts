import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import fr from '../../../../../public/i18n/fr.json';
import { RunHeaderComponent } from './run-header.component';

describe('RunHeaderComponent', () => {
  function render() {
    TestBed.configureTestingModule({ providers: [provideTranslateService(), provideRouter([])] });
    TestBed.inject(TranslateService).setTranslation('fr', fr);
    TestBed.inject(TranslateService).use('fr');
    const fixture = TestBed.createComponent(RunHeaderComponent);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('le logo à gauche, « Abandonner » à droite, rien d\'autre : ni ✕ ni haut-parleur ni cœurs', () => {
    const { element } = render();

    expect(element.textContent?.replace(/\s+/g, ' ')).toContain('IN//SECONDS');
    expect(element.querySelector('[data-testid="run-abandon"]')?.textContent?.trim()).toBe('Abandonner');
    expect(element.querySelector('[data-testid="run-sounds"]')).toBeNull();
    expect(element.querySelector('[data-testid="run-lives"]')).toBeNull();
  });

  it('« Abandonner » demande l\'abandon à la page', () => {
    const { fixture, element } = render();
    const abandon = vi.fn();
    fixture.componentInstance.abandon.subscribe(abandon);

    element.querySelector<HTMLButtonElement>('[data-testid="run-abandon"]')!.click();

    expect(abandon).toHaveBeenCalledTimes(1);
  });
});
