import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { StatusScreenComponent } from './status-screen.component';

describe('StatusScreenComponent', () => {
  function render(errorCode: string | null) {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(StatusScreenComponent);
    fixture.componentRef.setInput('titleKey', 'daily.error.title');
    fixture.componentRef.setInput('bodyKey', 'daily.error.body');
    fixture.componentRef.setInput('errorCode', errorCode);
    fixture.detectChanges();
    return { fixture, el: fixture.nativeElement as HTMLElement };
  }

  it('affiche le code d erreur quand il est fourni', () => {
    const { el } = render('0123456789abcdef0123456789abcdef');
    expect(el.querySelector('[data-testid="error-code"]')?.textContent).toContain('0123456789abcdef0123456789abcdef');
  });

  it('sans code d erreur, pas de ligne de code', () => {
    expect(render(null).el.querySelector('[data-testid="error-code"]')).toBeNull();
  });

  it('émet retry au clic', () => {
    const { fixture, el } = render(null);
    const spy = vi.fn();
    fixture.componentInstance.retry.subscribe(spy);
    el.querySelector('button')!.click();
    expect(spy).toHaveBeenCalled();
  });
});
