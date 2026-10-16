import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { ErrorMessageComponent } from './error-message.component';

describe('ErrorMessageComponent', () => {
  function render(traceId: string | null): HTMLElement {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(ErrorMessageComponent);
    fixture.componentRef.setInput('messageKey', 'errors.common.unknown');
    fixture.componentRef.setInput('traceId', traceId);
    fixture.detectChanges();
    return fixture.nativeElement as HTMLElement;
  }

  it('affiche le message et le code d\'erreur à transmettre', () => {
    const element = render('0123456789abcdef');

    expect(element.querySelector('[role="alert"]')?.textContent).toContain('errors.common.unknown');
    expect(element.querySelector('[data-testid="error-code"]')?.textContent).toBe('0123456789abcdef');
  });

  it('n\'affiche pas de code quand il n\'y en a pas (erreur réseau)', () => {
    expect(render(null).querySelector('[data-testid="error-code"]')).toBeNull();
  });
});
