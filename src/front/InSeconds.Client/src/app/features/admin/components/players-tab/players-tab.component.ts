import { Component, DestroyRef, inject, signal, computed, ChangeDetectionStrategy } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminApiService } from '../../services/admin-api.service';
import { StreakIconComponent } from '../../../../shared/streak-icon/streak-icon.component';
import { PlayerGameStatus, PlayerHistoryEntryDto } from '../../admin.models';

/** Historique d'un joueur : chargé au dépliage de sa ligne, rechargé à chaque nouveau dépliage. */
export type PlayerHistoryState = PlayerHistoryEntryDto[] | 'loading' | 'error';

@Component({
  selector: 'app-players-tab',
  imports: [DatePipe, TranslatePipe, StreakIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './players-tab.component.html',
})
export class PlayersTabComponent {
  protected readonly api = inject(AdminApiService);
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

  /**
   * Déplie/replie la ligne. L'historique est redemandé à chaque dépliage (une partie a pu être
   * jouée entre-temps) ; la version déjà chargée reste affichée pendant le rechargement.
   */
  protected toggle(playerId: string): void {
    if (this.expandedId() === playerId) {
      this.expandedId.set(null);
      return;
    }
    this.expandedId.set(playerId);
    const hasData = Array.isArray(this.histories()[playerId]);
    if (!hasData) this.setHistory(playerId, 'loading');

    this.api.getPlayerHistory(playerId)
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: res => this.setHistory(playerId, res.games),
        // Échec d'un rechargement : on garde la version déjà affichée.
        error: () => { if (!hasData) this.setHistory(playerId, 'error'); },
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
}
