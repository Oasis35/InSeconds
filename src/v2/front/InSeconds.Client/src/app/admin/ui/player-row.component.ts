import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { RegisteredPlayer } from '../domain/registered-player';
import { PlayerIconComponent } from './player-icon.component';

/**
 * Une ligne du tableau des comptes inscrits. Le bouton chevron sur le pseudo déplie ou replie
 * l'historique (rendu par le tableau, sous cette ligne). Les instants s'affichent en heure locale
 * du navigateur : « JJ/MM/AA à HH:MM » pour la dernière visite, « JJ/MM/AAAA » pour l'inscription.
 */
@Component({
  selector: 'tr[appPlayerRow]',
  imports: [DatePipe, TranslatePipe, PlayerIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    'data-testid': 'registered-player',
    '[style.border-bottom]': "expanded() ? 'none' : '1px solid var(--border-subtle)'",
    '[style.background]': "expanded() ? 'var(--bg-inactive)' : null",
  },
  template: `
    <td class="px-4 py-2.5 whitespace-nowrap">
      <button type="button" (click)="toggled.emit()"
        [attr.aria-expanded]="expanded()"
        [attr.aria-controls]="'player-history-' + player().id"
        [title]="'admin.players.historyToggle' | translate"
        class="inline-flex items-center gap-1.5 text-left cursor-pointer hover:underline"
        style="color:var(--text-hi)">
        <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true"
          class="transition-transform" [style.transform]="expanded() ? 'rotate(90deg)' : null">
          <path d="M3 1.5 6.5 5 3 8.5" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
        {{ player().pseudo ?? '—' }}
      </button>
      @if (player().isAdmin) {
        <span class="ml-1.5 text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded-full align-middle"
          style="color:var(--color-violet);background:rgb(var(--rgb-violet) / 0.15)">{{ 'admin.players.adminBadge' | translate }}</span>
      }
    </td>
    <td class="px-3 py-2.5" style="color:var(--text-body)">{{ player().email ?? '—' }}</td>
    <td class="px-3 py-2.5 text-right tabular-nums" style="color:var(--text-body)">{{ player().gamesPlayed }}</td>
    <td class="px-3 py-2.5 text-right tabular-nums whitespace-nowrap"
      [title]="player().streakProtected ? ('admin.players.streakProtected' | translate) : ''"
      [style.color]="player().streakProtected ? 'var(--color-accent-2)' : (player().currentStreak > 0 ? 'var(--color-accent-3)' : 'var(--text-faint)')">
      <span class="inline-flex items-center gap-1">
        <app-player-icon [name]="player().streakProtected ? 'snowflake' : 'flame'" />{{ player().currentStreak }}
      </span>
    </td>
    <td class="px-3 py-2.5 text-right tabular-nums whitespace-nowrap"
      [style.color]="player().streakFreezes > 0 ? 'var(--color-accent-2)' : 'var(--text-faint)'">
      <span class="inline-flex items-center gap-1">
        <app-player-icon name="snowflake" />{{ player().streakFreezes }}
      </span>
    </td>
    <td class="px-3 py-2.5 whitespace-nowrap">
      @if (player().lastSeenAt; as lastSeenAt) {
        <span style="color:var(--text-body)">{{ 'admin.players.lastSeenAt' | translate: { date: (lastSeenAt | date:'dd/MM/yy'), time: (lastSeenAt | date:'HH:mm') } }}</span>
      } @else {
        <span style="color:var(--text-faint)">{{ 'admin.players.neverSeen' | translate }}</span>
      }
    </td>
    <td class="px-4 py-2.5 whitespace-nowrap" style="color:var(--text-muted)">{{ player().createdAt | date:'dd/MM/yyyy' }}</td>
  `,
})
export class PlayerRowComponent {
  readonly player = input.required<RegisteredPlayer>();
  readonly expanded = input(false);
  readonly toggled = output();
}
