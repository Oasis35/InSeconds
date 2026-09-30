import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { ToastHostComponent } from './toast-host.component';
import { ToastService } from './toast.service';

describe('ToastHostComponent', () => {
  it('annonce les toasts aux lecteurs d\'écran et les ferme au clic', async () => {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(ToastHostComponent);
    const toasts = TestBed.inject(ToastService);
    const element = fixture.nativeElement as HTMLElement;

    toasts.show('common.retry', { durationMs: 0 });
    await fixture.whenStable();

    expect(element.querySelector('[role="status"]')?.getAttribute('aria-live')).toBe('polite');
    expect(element.querySelectorAll('[data-testid="toast"]')).toHaveLength(1);

    element.querySelector<HTMLButtonElement>('[data-testid="toast"] button')!.click();
    await fixture.whenStable();

    expect(element.querySelectorAll('[data-testid="toast"]')).toHaveLength(0);
  });
});
