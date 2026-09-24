import { Component, DestroyRef, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminApiService } from '../../services/admin-api.service';
import { LanguageService } from '../../../../core/services/language.service';
import { StreakIconComponent } from '../../../../shared/streak-icon/streak-icon.component';
import { PlayerGameStatus, PlayerHistoryEntryDto } from '../../admin.models';

/** Historique d'un joueur : chargé au premier dépliage de sa ligne, puis gardé en mémoire. */
export type PlayerHistoryState = PlayerHistoryEntryDto[] | 'loading' | 'error';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

@Component({
  selector: 'app-players-tab',
  imports: [DatePipe, TranslatePipe, StreakIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './players-tab.component.html',
})
export class PlayersTabComponent {
  protected readonly api = inject(AdminApiService);
  private readonly language = inject(LanguageService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly filter = signal('');

  /** Filtre texte sur le pseudo ou l'email (insensible à la casse). */
  protected readonly filteredPlayers = computed(() => {
    const q = this.filter().trim().toLowerCase();
    const players = this.api.registeredPlayers();
    if (!q) return players;
    return players.filter(p =>
      (p.pseudo ?? '').toLowerCase().includes(q) || (p.email ?? '').toLowerCase().includes(q));
  });

  /** Ligne dépliée (une seule à la fois). */
  protected readonly expandedId = signal<string | null>(null);
  protected readonly histories = signal<Record<string, PlayerHistoryState>>({});

  /** Déplie/replie la ligne ; l'historique n'est demandé qu'au premier dépliage (ou après une erreur). */
  protected toggle(playerId: string): void {
    if (this.expandedId() === playerId) {
      this.expandedId.set(null);
      return;
    }
    this.expandedId.set(playerId);
    const current = this.histories()[playerId];
    if (current && current !== 'error') return;

    this.setHistory(playerId, 'loading');
    this.api.getPlayerHistory(playerId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => this.setHistory(playerId, res.games),
        error: () => this.setHistory(playerId, 'error'),
      });
  }

  protected historyOf(playerId: string): PlayerHistoryState | undefined {
    return this.histories()[playerId];
  }

  protected statusColor(status: PlayerGameStatus): string {
    if (status === 'Completed') return 'var(--color-success)';
    if (status === 'Abandoned') return 'var(--color-warn)';
    if (status === 'Pending') return 'var(--color-accent-2)';
    return 'var(--text-muted)';
  }

  private setHistory(playerId: string, state: PlayerHistoryState): void {
    this.histories.update(h => ({ ...h, [playerId]: state }));
  }

  /** « il y a 3 h », « hier »… dans la langue courante, ou null si jamais vu. */
  protected relativeTime(iso: string | null, now = Date.now()): string | null {
    if (!iso) return null;
    const diff = new Date(iso).getTime() - now;
    const abs = Math.abs(diff);
    const rtf = new Intl.RelativeTimeFormat(this.language.current(), { numeric: 'auto' });
    if (abs < HOUR) return rtf.format(Math.round(diff / MINUTE), 'minute');
    if (abs < DAY) return rtf.format(Math.round(diff / HOUR), 'hour');
    return rtf.format(Math.round(diff / DAY), 'day');
  }
}
