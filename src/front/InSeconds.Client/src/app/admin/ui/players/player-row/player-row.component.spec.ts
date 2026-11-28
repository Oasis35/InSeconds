import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RegisteredPlayer } from '../../../domain/registered-player';
import { renderHost } from '../../testing/host';
import { PlayerRowComponent } from './player-row.component';

const base: RegisteredPlayer = {
  id: 'p-1', pseudo: 'Alice', email: 'alice@example.com', createdAt: '2026-10-01T08:00:00Z', lastSeenAt: '2026-11-20T09:30:00Z',
  gamesPlayed: 12, isAdmin: false, currentStreak: 0, streakFreezes: 0, streakProtected: false,
};

@Component({
  selector: 'app-test-host',
  imports: [PlayerRowComponent],
  template: `
    <table><tbody>
      <tr appPlayerRow [player]="player()" [expanded]="expanded()" [runAccess]="runAccess()" [runAccessPending]="pending()"
        (toggled)="toggles = toggles + 1" (runAccessToggled)="accessRequests.push($event)"></tr>
    </tbody></table>
  `,
})
class HostComponent {
  readonly player = signal<RegisteredPlayer>(base);
  readonly expanded = signal(false);
  readonly runAccess = signal(false);
  readonly pending = signal(false);
  toggles = 0;
  readonly accessRequests: boolean[] = [];
}

describe('PlayerRowComponent', () => {
  function render(player: Partial<RegisteredPlayer> = {}, inputs: { expanded?: boolean; runAccess?: boolean; pending?: boolean } = {}) {
    TestBed.resetTestingModule(); // un test peut monter plusieurs lignes : chaque rendu repart d'un module neuf
    const view = renderHost(HostComponent);
    view.host.player.set({ ...base, ...player });
    view.host.expanded.set(inputs.expanded ?? false);
    view.host.runAccess.set(inputs.runAccess ?? false);
    view.host.pending.set(inputs.pending ?? false);
    view.fixture.detectChanges();
    const row = view.element.querySelector<HTMLElement>('[data-testid="registered-player"]')!;
    const cells = Array.from(row.querySelectorAll('td'));
    const text = (cell: number) => cells[cell].textContent!.replace(/\s+/g, ' ').trim();
    return { ...view, row, cells, text, email: () => row.querySelector<HTMLButtonElement>('[data-testid="player-email"]'),
      access: () => row.querySelector<HTMLButtonElement>('[data-testid="run-access"]')!, toggle: () => row.querySelector<HTMLButtonElement>('td button')! };
  }

  it('le pseudo, et un trait quand le compte n\'en a pas', () => {
    expect(render().text(0)).toContain('Alice');
    expect(render({ pseudo: null }).text(0)).toBe('-');
  });

  it('le badge Admin ne s\'affiche que pour un admin', () => {
    expect(render({ isAdmin: false }).text(0)).not.toContain('admin.players.adminBadge');
    expect(render({ isAdmin: true }).text(0)).toContain('admin.players.adminBadge');
  });

  describe('email', () => {
    it('masqué tant qu\'on ne clique pas dessus, puis en clair, puis masqué de nouveau', () => {
      const { email, fixture } = render();
      expect(email()!.textContent!.trim()).toBe('a•••@example.com');
      expect(email()!.getAttribute('aria-pressed')).toBe('false');
      expect(email()!.title).toBe('admin.players.emailReveal');

      email()!.click();
      fixture.detectChanges();
      expect(email()!.textContent!.trim()).toBe('alice@example.com');
      expect(email()!.getAttribute('aria-pressed')).toBe('true');
      expect(email()!.title).toBe('admin.players.emailHide');

      email()!.click();
      fixture.detectChanges();
      expect(email()!.textContent!.trim()).toBe('a•••@example.com');
    });

    it('jamais l\'adresse complète dans la page avant le clic', () => {
      expect(render().row.textContent).not.toContain('alice@example.com');
    });

    it('un compte sans adresse : un trait, aucun bouton', () => {
      const view = render({ email: null });
      expect(view.email()).toBeNull();
      expect(view.text(1)).toBe('-');
    });

    it('chaque ligne garde son propre état : révéler une adresse ne montre pas celle d\'une autre ligne', () => {
      const first = render({ id: 'p-1', email: 'alice@example.com' });
      first.email()!.click();
      first.fixture.detectChanges();
      const second = render({ id: 'p-2', email: 'bob@example.com' });
      expect(second.email()!.textContent!.trim()).toBe('b•••@example.com');
    });
  });

  it('les parties, la série et les gels', () => {
    const { text } = render({ gamesPlayed: 12, currentStreak: 5, streakFreezes: 2 });

    expect(text(2)).toBe('12');
    expect(text(3)).toBe('5');
    expect(text(4)).toBe('2');
  });

  it('une série protégée par un gel le dit en infobulle, une série ordinaire non', () => {
    expect(render({ currentStreak: 3, streakProtected: true }).cells[3].title).toBe('admin.players.streakProtected');
    expect(render({ currentStreak: 3, streakProtected: false }).cells[3].title).toBe('');
  });

  it('la dernière visite en heure locale, ou « jamais vu »', () => {
    expect(render({ lastSeenAt: '2026-11-20T09:30:00Z' }).text(6)).toContain('admin.players.lastSeenAt');
    const never = render({ lastSeenAt: null }).text(6);
    expect(never).toContain('admin.players.neverSeen');
    expect(never).not.toContain('admin.players.lastSeenAt');
  });

  describe('historique', () => {
    it('le pseudo déplie ou replie l\'historique, et dit où est le contenu', () => {
      const { toggle, host } = render({ id: 'p-9' });

      expect(toggle().getAttribute('aria-controls')).toBe('player-history-p-9');
      toggle().click();
      toggle().click();
      expect(host.toggles).toBe(2);
    });

    it('l\'état déplié se lit sur le bouton et sur la ligne', () => {
      const closed = render({}, { expanded: false });
      expect(closed.toggle().getAttribute('aria-expanded')).toBe('false');
      expect(closed.row.style.borderBottom).toContain('1px solid');
      expect(closed.row.style.background).toBe('');

      const open = render({}, { expanded: true });
      expect(open.toggle().getAttribute('aria-expanded')).toBe('true');
      expect(open.row.style.background).toContain('var(--bg-inactive)');
    });
  });

  describe('accès à la Survie', () => {
    it('l\'interrupteur dit l\'état, et un clic demande l\'état inverse', () => {
      const off = render({}, { runAccess: false });
      expect(off.access().getAttribute('role')).toBe('switch');
      expect(off.access().getAttribute('aria-checked')).toBe('false');
      off.access().click();
      expect(off.host.accessRequests).toEqual([true]);

      const on = render({}, { runAccess: true });
      expect(on.access().getAttribute('aria-checked')).toBe('true');
      on.access().click();
      expect(on.host.accessRequests).toEqual([false]);
    });

    it('vaut aussi pour un admin, qui n\'a pas l\'accès d\'office', () => {
      const { access, host } = render({ isAdmin: true }, { runAccess: false });

      expect(access().disabled).toBe(false);
      access().click();
      expect(host.accessRequests).toEqual([true]);
    });

    it('tant que l\'API n\'a pas répondu, l\'interrupteur est grisé et un clic ne demande rien', () => {
      const { access, host } = render({}, { pending: true });

      expect(access().disabled).toBe(true);
      access().click();
      expect(host.accessRequests).toEqual([]);
    });
  });
});
