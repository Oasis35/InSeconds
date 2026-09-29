import { Component, inject, signal, computed, linkedSignal, ChangeDetectionStrategy } from '@angular/core';
import { rxResource } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
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

  /**
   * Demande d'historique en cours : `n` change à chaque dépliage pour forcer un nouveau chargement
   * (une partie a pu être jouée entre-temps), même si c'est le même joueur que la dernière fois.
   */
  private readonly historyRequest = signal<{ id: string; n: number } | undefined>(undefined);
  private readonly historyResource = rxResource({
    params: () => this.historyRequest(),
    stream: ({ params }) => this.api.getPlayerHistory(params.id).pipe(map(res => res.games)),
  });

  /** Dernier historique chargé par joueur : reste affiché pendant un rechargement et si celui-ci échoue. */
  private readonly loadedHistories = linkedSignal<
    { id: string | undefined; games: PlayerHistoryEntryDto[] | undefined },
    Readonly<Record<string, PlayerHistoryEntryDto[]>>
  >({
    source: () => ({
      id: this.historyRequest()?.id,
      games: this.historyResource.status() === 'resolved' ? this.historyResource.value() : undefined,
    }),
    computation: ({ id, games }, previous) => {
      const cache = previous?.value ?? {};
      return id && games ? { ...cache, [id]: games } : cache;
    },
  });

  /** Déplie/replie la ligne ; chaque dépliage relance le chargement de l'historique. */
  protected toggle(playerId: string): void {
    if (this.expandedId() === playerId) {
      this.expandedId.set(null);
      return;
    }
    this.expandedId.set(playerId);
    this.historyRequest.update(r => ({ id: playerId, n: (r?.n ?? 0) + 1 }));
  }

  protected historyOf(playerId: string): PlayerHistoryState | undefined {
    const loaded = this.loadedHistories()[playerId];
    if (loaded) return loaded;
    if (this.historyRequest()?.id !== playerId) return undefined;
    return this.historyResource.status() === 'error' ? 'error' : 'loading';
  }

  protected statusColor(status: PlayerGameStatus): string {
    if (status === 'Completed') return 'var(--color-success)';
    if (status === 'Abandoned') return 'var(--color-warn)';
    if (status === 'Pending') return 'var(--color-accent-2)';
    return 'var(--text-muted)';
  }
}
