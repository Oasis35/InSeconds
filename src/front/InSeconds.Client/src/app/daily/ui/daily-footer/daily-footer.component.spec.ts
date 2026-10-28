import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideTranslateService } from '@ngx-translate/core';
import { DailyFooterComponent } from './daily-footer.component';

describe('DailyFooterComponent', () => {
  function render(lang: 'fr' | 'en' = 'fr') {
    TestBed.resetTestingModule();
    TestBed.configureTestingModule({ providers: [provideTranslateService(), provideRouter([])] });
    const fixture = TestBed.createComponent(DailyFooterComponent);
    fixture.componentRef.setInput('lang', lang);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('affiche mentions légales, confidentialité, contact et Instagram', () => {
    const { el } = render();
    expect(el.querySelector('a[href="/legal"]')).not.toBeNull();
    expect(el.querySelector('a[href="/privacy"]')).not.toBeNull();
    expect(el.querySelector('a[href="mailto:contact@inseconds.cc"]')).not.toBeNull();
    const instagram = el.querySelector<HTMLAnchorElement>('a[href="https://www.instagram.com/inseconds.cc/"]');
    expect(instagram?.rel).toContain('noopener');
  });

  it("n'a plus de lien admin ni de lien vers les jours passés", () => {
    const { el } = render();
    expect(el.querySelector('a[href="/admin"]')).toBeNull();
    expect(el.querySelector('a[href^="/daily/archive"]')).toBeNull();
  });

  it('met la langue courante en avant et émet toggleLanguage au clic', () => {
    const { fixture, el } = render('en');
    const button = el.querySelector<HTMLButtonElement>('[data-testid="footer-language"]')!;
    expect(button.textContent?.replace(/\s+/g, '')).toBe('FR/EN');
    expect(button.querySelector('.font-semibold')?.textContent).toBe('EN');
    const spy = vi.fn();
    fixture.componentInstance.toggleLanguage.subscribe(spy);
    button.click();
    expect(spy).toHaveBeenCalled();
  });
});
