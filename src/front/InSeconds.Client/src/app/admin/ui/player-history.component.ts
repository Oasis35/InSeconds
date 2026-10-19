import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { PlayerGame, PlayerGameStatus } from '../domain/registered-player';
import { PlayerIconComponent } from './player-icon.component';

const STATUS_COLORS: Record<PlayerGameStatus, string> = {
  Completed: 'var(--color-success)',
  Abandoned: 'var(--color-warn)',
  Pending: 'var(--color-accent-2)',
  Expired: 'var(--text-muted)',
};

/**
 * Historique d'un joueur (30 derniers jours). Les parties déjà lues restent affichées pendant un
 * rechargement ou si celui-ci échoue ; sans elles, l'état de chargement ou d'erreur prend leur place.
 */
@Component({
  selector: 'app-player-history',
  imports: [DatePipe, TranslatePipe, PlayerIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (games(); as list) {
      @if (list.length === 0) {
        <p class="text-xs" style="color:var(--text-muted)">{{ 'admin.players.historyEmpty' | translate }}</p>
      } @else {
        <p class="text-[11px] uppercase tracking-wide mb-1.5" style="color:var(--text-faint)">{{ 'admin.players.historyTitle' | translate }}</p>
        <!-- Largeur bornée à l'écran : lisible sur mobile même quand le tableau défile en largeur. -->
        <ul class="flex flex-col text-xs" style="width:min(24rem, calc(100vw - 6rem))">
          @for (game of list; track game.date) {
            <li class="grid grid-cols-[6.5rem_1fr_auto] items-center gap-3 py-1" style="border-top:1px solid var(--border-subtle)">
              <span class="tabular-nums" style="color:var(--text-body)">{{ game.date | date:'dd/MM/yyyy' }}</span>
              <span class="inline-flex items-center gap-1.5" [style.color]="color(game.status)">
                {{ 'admin.players.status.' + game.status | translate }}
                @if (game.freezesUsed > 0) {
                  <span [title]="'admin.players.freezesUsed' | translate: { count: game.freezesUsed }" style="color:var(--color-accent-2)">
                    <app-player-icon name="snowflake" size="11px" />
                  </span>
                }
              </span>
              <span class="tabular-nums text-right" style="color:var(--text-hi)">{{ game.score ?? '—' }}</span>
            </li>
          }
        </ul>
      }
    } @else if (status() === 'error') {
      <p class="text-xs" style="color:var(--text-error)">{{ 'admin.players.historyError' | translate }}</p>
    } @else {
      <p class="text-xs" style="color:var(--text-muted)">{{ 'admin.players.historyLoading' | translate }}</p>
    }
  `,
})
export class PlayerHistoryComponent {
  /** Les parties déjà lues, ou `null` si aucune lecture n'a encore abouti. */
  readonly games = input<readonly PlayerGame[] | null>(null);
  readonly status = input<'idle' | 'loading' | 'error'>('loading');

  protected color(status: PlayerGameStatus): string {
    return STATUS_COLORS[status];
  }
}
