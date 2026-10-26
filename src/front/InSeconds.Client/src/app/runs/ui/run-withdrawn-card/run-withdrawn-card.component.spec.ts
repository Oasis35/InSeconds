import { TestBed } from '@angular/core/testing';
import { TranslateService, provideTranslateService } from '@ngx-translate/core';
import fr from '../../../../../public/i18n/fr.json';
import { RunWithdrawnCardComponent } from './run-withdrawn-card.component';

describe('RunWithdrawnCardComponent', () => {
  function render(endsRound = false) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    TestBed.inject(TranslateService).setTranslation('fr', fr);
    TestBed.inject(TranslateService).use('fr');
    const fixture = TestBed.createComponent(RunWithdrawnCardComponent);
    fixture.componentRef.setInput('objective', 266);
    fixture.componentRef.setInput('endsRound', endsRound);
    fixture.detectChanges();
    return { fixture, element: fixture.nativeElement as HTMLElement };
  }

  it('dit que le morceau est retiré et donne le nouvel objectif, sans rien révéler du morceau', () => {
    const { element } = render();

    expect(element.textContent).toContain('Morceau retiré de la manche');
    expect(element.querySelector('[data-testid="run-withdrawn-body"]')?.textContent).toContain('266 pts');
    expect(element.querySelector('img')).toBeNull();
  });

  it('« Morceau suivant », ou « Fin de la manche » si c\'était le dernier', () => {
    expect(render().element.querySelector('[data-testid="run-next-track"]')?.textContent).toContain('Morceau suivant');
    TestBed.resetTestingModule();
    expect(render(true).element.querySelector('[data-testid="run-next-track"]')?.textContent).toContain('Fin de la manche');
  });

  it('le bouton demande le morceau suivant', () => {
    const { fixture, element } = render();
    const next = vi.fn();
    fixture.componentInstance.next.subscribe(next);

    (element.querySelector('[data-testid="run-next-track"]') as HTMLButtonElement).click();

    expect(next).toHaveBeenCalled();
  });
});
