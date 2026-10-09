import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { errorMessageKey } from '../../core/errors/error-messages';
import { ErrorMessageComponent } from '../../ui/error-message/error-message.component';
import { AdminPlayersStore } from '../data-access/players.store';
import { PlayerHistoryComponent } from '../ui/player-history.component';
import { PlayerRowComponent } from '../ui/player-row.component';

/**
 * `/admin/joueurs` : les comptes inscrits, les plus récemment vus d'abord, avec un filtre texte et,
 * sous chaque ligne dépliée (une seule à la fois), l'historique des 30 derniers jours.
 * La liste n'est lue qu'à l'ouverture de l'onglet (la page n'existe qu'alors).
 */
@Component({
  selector: 'app-admin-players-page',
  imports: [TranslatePipe, ErrorMessageComponent, PlayerRowComponent, PlayerHistoryComponent],
  providers: [AdminPlayersStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex w-full min-w-0 justify-center' },
  template: `
    <section class="flex flex-col gap-4 w-full max-w-4xl" data-testid="admin-players-page">
      <div class="rounded-xl flex flex-col overflow-hidden" style="background:var(--bg-surface)">
        <div class="flex flex-wrap items-center justify-between gap-3 p-4">
          <h2 class="text-sm font-semibold uppercase tracking-wide" style="color:var(--text-muted)">
            {{ 'admin.players.title' | translate: { count: store.players().length } }}
          </h2>
          <label for="players-filter-text" class="sr-only">{{ 'admin.players.filterPlaceholder' | translate }}</label>
          <input id="players-filter-text" type="search"
            [value]="store.filter()"
            (input)="store.setFilter($any($event.target).value)"
            [placeholder]="'admin.players.filterPlaceholder' | translate"
            class="w-full sm:w-56 px-3 py-2 rounded-lg text-sm outline-none"
            style="background:var(--bg-inactive);color:var(--text-hi);border:1px solid var(--border-medium)" />
        </div>

        @if (store.error(); as error) {
          <div class="px-4 pb-4">
            <app-error-message [messageKey]="messageKey(error.code)" [traceId]="error.traceId" />
          </div>
        } @else if (!store.isFulfilled()) {
          <p class="text-sm px-4 pb-4" style="color:var(--text-muted)">{{ 'admin.players.loading' | translate }}</p>
        } @else if (store.players().length === 0) {
          <p class="text-sm px-4 pb-4" style="color:var(--text-muted)">{{ 'admin.players.empty' | translate }}</p>
        } @else if (store.filteredPlayers().length === 0) {
          <p class="text-sm px-4 pb-4" style="color:var(--text-muted)">{{ 'admin.players.noMatch' | translate }}</p>
        } @else {
          <div class="overflow-x-auto">
            <table class="w-full text-sm">
              <thead>
                <tr class="text-left text-xs uppercase tracking-wide" style="border-bottom:1px solid var(--border-medium);color:var(--text-muted)">
                  <th class="px-4 py-2.5">{{ 'admin.players.colPseudo' | translate }}</th>
                  <th class="px-3 py-2.5">{{ 'admin.players.colEmail' | translate }}</th>
                  <th class="px-3 py-2.5 text-right">{{ 'admin.players.colGames' | translate }}</th>
                  <th class="px-3 py-2.5 text-right">{{ 'admin.players.colStreak' | translate }}</th>
                  <th class="px-3 py-2.5 text-right">{{ 'admin.players.colFreezes' | translate }}</th>
                  <th class="px-3 py-2.5 whitespace-nowrap">{{ 'admin.players.colLastSeen' | translate }}</th>
                  <th class="px-4 py-2.5 whitespace-nowrap">{{ 'admin.players.colCreated' | translate }}</th>
                </tr>
              </thead>
              <tbody>
                @for (player of store.filteredPlayers(); track player.id) {
                  @let expanded = store.expandedId() === player.id;
                  <tr appPlayerRow [player]="player" [expanded]="expanded" (toggled)="store.toggle(player.id)"></tr>
                  @if (expanded && store.expandedHistory(); as history) {
                    <tr data-testid="player-history" [id]="'player-history-' + player.id"
                      style="border-bottom:1px solid var(--border-subtle);background:var(--bg-inactive)">
                      <td colspan="7" class="px-4 pb-3 pt-1">
                        <app-player-history [games]="history.games" [status]="history.status" />
                      </td>
                    </tr>
                  }
                }
              </tbody>
            </table>
          </div>
        }
      </div>
    </section>
  `,
})
export class PlayersPage {
  protected readonly store = inject(AdminPlayersStore);
  protected readonly messageKey = errorMessageKey;

  constructor() {
    void this.store.load();
  }
}
