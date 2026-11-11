import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { RegisteredPlayer } from '../../../domain/registered-player';
import { PlayerIconComponent } from '../player-icon/player-icon.component';

/**
 * Un compte inscrit en carte (onglet Joueurs, téléphone) : le pseudo (qui déplie l'historique, rendu par la page sous la carte), la
 * série et les gels, puis les parties, la dernière visite et l'interrupteur d'accès à Setlist (posé d'office pour un admin). L'email
 * n'y est pas : il reste dans le tableau du PC, masqué tant qu'on ne clique pas dessus (minimisation, RGPD).
 */
@Component({
  selector: 'li[appPlayerCard]',
  imports: [DatePipe, TranslatePipe, PlayerIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'data-testid': 'registered-player',
    class: 'block px-4 py-3',
    style: 'border-top:1px solid var(--border-subtle)',
    '[style.background]': "expanded() ? 'var(--bg-inactive)' : null",
  },
  template: `
    <div class="flex items-center gap-2">
      <button type="button" (click)="toggled.emit()" [attr.aria-expanded]="expanded()" [attr.aria-controls]="'player-history-' + player().id"
        [title]="'admin.players.historyToggle' | translate" class="flex-1 min-w-0 inline-flex items-center gap-1.5 text-left">
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" class="shrink-0 transition-transform" [style.transform]="expanded() ? 'rotate(90deg)' : null">
          <path d="M3 1.5 6.5 5 3 8.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        <span class="font-medium truncate" style="color:var(--text-hi)">{{ player().pseudo ?? '-' }}</span>
        @if (player().isAdmin) {
          <span class="shrink-0 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full"
            style="color:var(--color-violet);background:rgb(var(--rgb-violet) / 0.15)">{{ 'admin.players.adminBadge' | translate }}</span>
        }
      </button>
      <span class="inline-flex items-center gap-1 text-sm tabular-nums" [title]="player().streakProtected ? ('admin.players.streakProtected' | translate) : ''"
        [style.color]="player().streakProtected ? 'var(--color-accent-2)' : (player().currentStreak > 0 ? 'var(--color-accent-3)' : 'var(--text-faint)')">
        <app-player-icon [name]="player().streakProtected ? 'snowflake' : 'flame'" />{{ player().currentStreak }}
      </span>
      <span class="inline-flex items-center gap-1 text-sm tabular-nums" [style.color]="player().streakFreezes > 0 ? 'var(--color-accent-2)' : 'var(--text-faint)'">
        <app-player-icon name="snowflake" />{{ player().streakFreezes }}
      </span>
    </div>
    <div class="mt-1 flex items-center gap-2 text-xs" style="color:var(--text-muted)">
      <span class="min-w-0 truncate">
        {{ 'admin.players.gamesCount' | translate: { count: player().gamesPlayed } }} ·
        @if (player().lastSeenAt; as lastSeenAt) {
          {{ 'admin.players.seenOn' | translate: { date: (lastSeenAt | date: 'dd/MM') } }}
        } @else {
          {{ 'admin.players.neverSeen' | translate }}
        }
      </span>
      <span class="ml-auto shrink-0 inline-flex items-center gap-1.5" [title]="(player().isAdmin ? 'admin.players.runAccessAdmin' : 'admin.players.runAccessToggle') | translate">
        {{ 'admin.players.colRun' | translate }}
        <button type="button" role="switch" data-testid="run-access" [attr.aria-checked]="runAccess()"
          [attr.aria-label]="'admin.players.runAccessToggle' | translate" [disabled]="player().isAdmin || runAccessPending()"
          (click)="runAccessToggled.emit(!runAccess())"
          class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
          [style.background]="runAccess() ? 'var(--color-success)' : 'var(--border-strong)'">
          <span class="inline-block h-4 w-4 rounded-full bg-white transition-transform" [style.transform]="runAccess() ? 'translateX(18px)' : 'translateX(2px)'"></span>
        </button>
      </span>
    </div>
    <ng-content />
  `,
})
export class PlayerCardComponent {
  readonly player = input.required<RegisteredPlayer>();
  readonly expanded = input(false);
  /** Le compte peut lancer un run (admin d'office, ou autorisé par l'interrupteur). */
  readonly runAccess = input(false);
  /** L'API n'a pas encore répondu à un changement d'accès de ce compte. */
  readonly runAccessPending = input(false);
  readonly toggled = output();
  /** Le nouvel état demandé de l'interrupteur. */
  readonly runAccessToggled = output<boolean>();
}
