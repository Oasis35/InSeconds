import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { PlayerPseudoResetComponent } from './player-pseudo-reset.component';

@Component({
  imports: [PlayerPseudoResetComponent],
  template: `<app-player-pseudo-reset [pending]="pending()" [errorKey]="errorKey()" (confirmed)="confirmations = confirmations + 1" />`,
})
class HostComponent {
  pending = signal(false);
  errorKey = signal<string | null>(null);
  confirmations = 0;
}

describe('PlayerPseudoResetComponent', () => {
  function render() {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const element = fixture.nativeElement as HTMLElement;
    const click = (testId: string) => {
      (element.querySelector(`[data-testid="${testId}"]`) as HTMLElement).click();
      fixture.detectChanges();
    };
    return { fixture, element, host: fixture.componentInstance, click };
  }

  it('ne remet rien à zéro sans confirmation', () => {
    const { host, click } = render();
    click('pseudo-reset-open');
    expect(host.confirmations).toBe(0);
    click('confirm-pseudo-reset');
    expect(host.confirmations).toBe(1);
  });

  it('peut renoncer à la confirmation', () => {
    const { element, host, click } = render();
    click('pseudo-reset-open');
    (Array.from(element.querySelectorAll('button')).find(b => b.textContent?.includes('resetPseudoCancel')) as HTMLElement).click();
    expect(element.querySelector('[data-testid="pseudo-reset-open"]')).toBeNull();
    expect(host.confirmations).toBe(0);
  });

  it('montre le refus et reste ouvert, puis se referme à la réussite', () => {
    const { fixture, element, host, click } = render();
    click('pseudo-reset-open');
    host.pending.set(true);
    fixture.detectChanges();
    host.pending.set(false);
    host.errorKey.set('errors.common.not_found');
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="pseudo-reset-error"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="confirm-pseudo-reset"]')).not.toBeNull();

    host.errorKey.set(null);
    host.pending.set(true);
    fixture.detectChanges();
    host.pending.set(false);
    fixture.detectChanges();
    expect(element.querySelector('[data-testid="pseudo-reset-open"]')).not.toBeNull();
  });
});
