import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { StatusScreenComponent } from './status-screen.component';

describe('StatusScreenComponent', () => {
  function render(errorCode: string | null) {
    TestBed.configureTestingModule({
      imports: [StatusScreenComponent],
      providers: [provideTranslateService()],
    });
    const fixture = TestBed.createComponent(StatusScreenComponent);
    fixture.componentRef.setInput('titleKey', 'error.title');
    fixture.componentRef.setInput('bodyKey', 'error.body');
    fixture.componentRef.setInput('errorCode', errorCode);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it("affiche le code d'erreur quand il est fourni", () => {
    const el = render('0123456789abcdef0123456789abcdef');

    expect(el.querySelector('[data-testid="error-code"]')?.textContent).toContain('0123456789abcdef0123456789abcdef');
  });

  it("n'affiche pas de ligne de code sans code d'erreur", () => {
    const el = render(null);

    expect(el.querySelector('[data-testid="error-code"]')).toBeNull();
  });
});
