import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { DailyFooterComponent } from './daily-footer.component';

describe('DailyFooterComponent', () => {
  function render(isAdmin: boolean, lang: 'fr' | 'en' = 'fr') {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideTranslateService(), provideRouter([])] });
    const fixture = TestBed.createComponent(DailyFooterComponent);
    fixture.componentRef.setInput('isAdmin', isAdmin);
    fixture.componentRef.setInput('lang', lang);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('le lien admin apparaît seulement pour un admin', () => {
    expect(render(true).el.querySelector('a[href="/admin"]')).not.toBeNull();
    expect(render(false).el.querySelector('a[href="/admin"]')).toBeNull();
  });

  it('affiche confidentialité et contact', () => {
    const { el } = render(false);
    expect(el.querySelector('a[href="/privacy"]')).not.toBeNull();
    expect(el.querySelector('a[href="mailto:contact@inseconds.cc"]')).not.toBeNull();
  });

  it('affiche la langue courante et émet toggleLanguage au clic', () => {
    const { fixture, el } = render(false, 'en');
    const button = el.querySelector('button')!;
    expect(button.textContent).toContain('en');
    const spy = vi.fn();
    fixture.componentInstance.toggleLanguage.subscribe(spy);
    button.click();
    expect(spy).toHaveBeenCalled();
  });
});
