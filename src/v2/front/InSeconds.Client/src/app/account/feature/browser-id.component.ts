import { ChangeDetectionStrategy, Component, DestroyRef, inject, signal } from '@angular/core';
import { ClipboardService } from '../../core/clipboard/clipboard.service';
import { SessionStore } from '../../core/session/session.store';
import { SessionLoader } from '../data-access/session-loader';
import { BrowserIdViewComponent } from '../ui/browser-id-view.component';

const COPIED_MESSAGE_MS = 2000;

/**
 * Identifiant court du navigateur courant, avec un bouton pour copier l'identifiant complet
 * (repérer ses propres parties dans l'admin). Il doit exister même si la personne ne joue jamais :
 * sans identité, le composant crée l'invité (`POST /api/players/guest`), jamais un `GET`.
 */
@Component({
  selector: 'app-browser-id',
  imports: [BrowserIdViewComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (session.player(); as player) {
      <app-browser-id-view [playerId]="player.id" [copied]="copied()" (copyId)="copy(player.id)" />
    }
  `,
})
export class BrowserIdComponent {
  protected readonly session = inject(SessionStore);
  protected readonly copied = signal(false);
  private readonly clipboard = inject(ClipboardService);
  private timer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    void inject(SessionLoader).ensureGuest();
    inject(DestroyRef).onDestroy(() => clearTimeout(this.timer));
  }

  protected async copy(id: string): Promise<void> {
    // `ClipboardService` retombe sur la copie par textarea quand `writeText` refuse (focus, permission : piège 45). Si les deux
    // échouent, l'identifiant complet reste lisible dans l'infobulle.
    if (!(await this.clipboard.copy(id))) return;
    this.copied.set(true);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.copied.set(false), COPIED_MESSAGE_MS);
  }
}
