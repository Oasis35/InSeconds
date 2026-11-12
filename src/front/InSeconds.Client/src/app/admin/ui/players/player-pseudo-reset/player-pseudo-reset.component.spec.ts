import { Component, signal } from '@angular/core';
import { finishPending, renderHost } from '../../testing/host';
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
  const render = () => renderHost(HostComponent);

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
    finishPending(fixture, host, 'errors.common.not_found');
    expect(element.querySelector('[data-testid="pseudo-reset-error"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="confirm-pseudo-reset"]')).not.toBeNull();

    finishPending(fixture, host, null);
    expect(element.querySelector('[data-testid="pseudo-reset-open"]')).not.toBeNull();
  });
});
