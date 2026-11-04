import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { registeredPlayer } from '../../../data-access/testing/fake-admin-players-api';
import { RegisteredPlayer } from '../../../domain/registered-player';
import { PlayerCardComponent } from './player-card.component';

@Component({
  imports: [PlayerCardComponent],
  template: `<ul><li appPlayerCard [player]="player()" [expanded]="expanded()" [runAccess]="runAccess()"
    (toggled)="toggles = toggles + 1" (runAccessToggled)="requested = $event"><p data-testid="projected">historique</p></li></ul>`,
})
class HostComponent {
  readonly player = signal<RegisteredPlayer>(registeredPlayer({ id: 'a', pseudo: 'Alice', currentStreak: 4, streakFreezes: 1 }));
  readonly expanded = signal(false);
  readonly runAccess = signal(false);
  toggles = 0;
  requested: boolean | null = null;
}

describe('PlayerCardComponent', () => {
  function render() {
    TestBed.configureTestingModule({ providers: [provideTranslateService()] });
    const fixture = TestBed.createComponent(HostComponent);
    fixture.detectChanges();
    const card = (fixture.nativeElement as HTMLElement).querySelector('[data-testid="registered-player"]') as HTMLElement;
    return { fixture, card, host: fixture.componentInstance };
  }

  it('affiche le pseudo, la série et les gels, et projette l\'historique', () => {
    const { card } = render();
    expect(card.textContent).toContain('Alice');
    expect(card.textContent).toContain('4');
    expect(card.textContent).toContain('1');
    expect(card.querySelector('[data-testid="projected"]')).not.toBeNull();
  });

  it('émet le dépliage au clic sur le pseudo', () => {
    const { card, host, fixture } = render();
    (card.querySelector('button') as HTMLButtonElement).click();
    expect(host.toggles).toBe(1);
    host.expanded.set(true);
    fixture.detectChanges();
    expect(card.querySelector('button')?.getAttribute('aria-expanded')).toBe('true');
  });

  it('demande le nouvel état de l\'interrupteur, désactivé pour un admin', () => {
    const { card, host, fixture } = render();
    const toggle = card.querySelector('[data-testid="run-access"]') as HTMLButtonElement;
    toggle.click();
    expect(host.requested).toBe(true);

    host.player.set(registeredPlayer({ id: 'a', pseudo: 'Alice', isAdmin: true }));
    host.runAccess.set(true);
    fixture.detectChanges();
    expect(toggle.disabled).toBe(true);
    expect(toggle.getAttribute('aria-checked')).toBe('true');
  });
});
