import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { PoolSort, SortColumn } from '../../../domain/pool-filters';
import { ModeUsage, PoolTrack, trackLabel, usageOf } from '../../../domain/pool-track';
import { POOL_VIEW, modeView } from '../../../domain/pool-views';

interface Column {
  readonly column: SortColumn;
  readonly labelKey: string;
  readonly widthClass?: string;
}

/** Le pool général : le morceau, son genre, son extrait, son statut et les modes qui l'ont joué (pastilles). */
const POOL_COLUMNS: readonly Column[] = [
  { column: 'artist', labelKey: 'admin.pool.colArtist' },
  { column: 'title', labelKey: 'admin.pool.colTitle' },
  { column: 'genre', labelKey: 'admin.pool.colGenre' },
  { column: 'preview', labelKey: 'admin.pool.colPreview', widthClass: 'w-28' },
  { column: 'status', labelKey: 'admin.pool.colStatus', widthClass: 'w-24' },
  { column: 'usage', labelKey: 'admin.pool.colUsage' },
];

/** La vue d'un mode : le morceau et ce que ce mode en a fait (dernier jour, déblocage, apparitions), sans extrait ni statut. */
const MODE_COLUMNS: readonly Column[] = [
  { column: 'artist', labelKey: 'admin.pool.colArtist' },
  { column: 'title', labelKey: 'admin.pool.colTitle' },
  { column: 'lastUsedDate', labelKey: 'admin.pool.colLastUsed', widthClass: 'w-28' },
  { column: 'unlockDate', labelKey: 'admin.pool.colUnlockDate', widthClass: 'w-28' },
  { column: 'usageCount', labelKey: 'admin.pool.colUsageCount', widthClass: 'w-20' },
];

/**
 * Le tableau du pool et sa pagination. Toutes les colonnes sont triables. Dans la vue générale, sur une ligne : écouter
 * (▶), corriger les noms (✎, toujours possible, défi du jour compris), puis supprimer (🗑) pour un morceau qu'aucun mode n'a
 * joué, ou désactiver / réactiver pour un morceau déjà joué ou désactivé. Dans la vue d'un mode (lecture seule) : écouter,
 * et « ↗ » pour retrouver le morceau dans le pool, où l'on agit dessus.
 */
@Component({
  selector: 'app-pool-table',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block min-w-0' },
  template: `
    <div class="rounded-xl flex flex-col overflow-hidden" style="background:var(--bg-surface)">
      @if (loading()) {
        <p class="text-sm p-5" style="color:var(--text-muted)">{{ 'admin.pool.checkingPreviews' | translate }}</p>
      } @else if (totalCount() === 0) {
        <p class="text-sm p-5" style="color:var(--text-muted)">{{ 'admin.pool.empty' | translate }}</p>
      } @else {
        <div class="overflow-x-auto">
          <table class="w-full text-sm">
            <thead>
              <tr class="text-left text-xs uppercase tracking-wide" style="border-bottom:1px solid var(--border-medium);color:var(--text-muted)">
                @if (isPool()) {
                  <th class="pl-4 pr-2 py-2.5 w-8"></th>
                }
                <th class="px-3 py-2.5" [class.pl-4]="!isPool()" [class.w-40]="isPool()">{{ 'admin.pool.colActions' | translate }}</th>
                @for (col of columns(); track col.column) {
                  <th class="p-0" [class]="col.widthClass ?? ''" [attr.aria-sort]="ariaSort(col.column)">
                    <button type="button" (click)="sortBy.emit(col.column)"
                      class="w-full px-3 py-2.5 cursor-pointer select-none bg-transparent border-0 text-inherit uppercase tracking-wide inline-flex items-center gap-1">
                      {{ col.labelKey | translate }}
                      @if (sort()?.column === col.column) {
                        <span class="text-[10px]">{{ sort()?.direction === 'asc' ? '▲' : '▼' }}</span>
                      }
                    </button>
                  </th>
                }
              </tr>
            </thead>
            <tbody>
              @for (t of tracks(); track t.id) {
                <tr class="transition-colors" style="border-bottom:1px solid var(--border-subtle)"
                  [style.background]="isPool() && selectedIds().includes(t.id) ? 'rgb(var(--rgb-violet) / 0.08)' : null">
                  @if (isPool()) {
                    <td class="pl-4 pr-2 py-2.5">
                      <input type="checkbox" [checked]="selectedIds().includes(t.id)" (change)="toggleSelection.emit(t.id)"
                        [attr.aria-label]="label(t)" class="w-4 h-4 cursor-pointer" />
                    </td>
                  }
                  <td class="px-3 py-2.5" [class.pl-4]="!isPool()">
                    <div class="flex items-center gap-2">
                      <button type="button" (click)="listen.emit(t)" class="text-xs px-2 py-1 rounded transition-colors"
                        style="color:var(--text-indigo);border:1px solid rgb(var(--rgb-violet) / 0.3)"
                        [title]="'admin.pool.listenTitle' | translate">▶</button>
                      @if (isPool()) {
                        <button type="button" (click)="edit.emit(t)" class="text-xs px-2 py-1 rounded transition-colors"
                          style="color:var(--text-muted);border:1px solid var(--border-strong)"
                          [title]="'admin.pool.editTitle' | translate">✎</button>
                        <!-- Le title est porté par un span : un bouton désactivé n'affiche pas son tooltip partout. -->
                        @if (t.isUsed || t.isDisabled) {
                          @let lockedToday = !t.isDisabled && t.inTodayChallenge;
                          <span [title]="(lockedToday ? 'admin.pool.disableTodayTitle' : (t.isDisabled ? 'admin.pool.enableTitle' : 'admin.pool.disableTitle')) | translate">
                            <button type="button" (click)="toggleDisabled.emit(t)" [disabled]="lockedToday || togglingIds().includes(t.id)"
                              class="text-xs px-2 py-1 rounded transition-colors whitespace-nowrap disabled:opacity-30 disabled:cursor-not-allowed"
                              [style.color]="t.isDisabled ? 'var(--color-success)' : 'var(--text-muted)'"
                              style="border:1px solid var(--border-strong)">
                              {{ (t.isDisabled ? 'admin.pool.enable' : 'admin.pool.disable') | translate }}
                            </button>
                          </span>
                        } @else {
                          <span [title]="'admin.pool.deleteTitle' | translate">
                            <button type="button" (click)="delete.emit(t)" class="text-xs px-2 py-1 rounded transition-colors"
                              style="color:var(--text-muted);border:1px solid var(--border-strong)">🗑</button>
                          </span>
                        }
                      } @else {
                        <button type="button" (click)="openInPool.emit(t)" class="text-xs px-2 py-1 rounded transition-colors"
                          style="color:var(--text-muted);border:1px solid var(--border-strong)"
                          [title]="'admin.pool.openInPoolTitle' | translate" [attr.aria-label]="'admin.pool.openInPoolTitle' | translate">↗</button>
                      }
                    </div>
                  </td>
                  <td class="px-3 py-2.5 font-medium max-w-[130px] truncate" [class.opacity-50]="t.isDisabled" style="color:var(--text-hi)">{{ t.artist }}</td>
                  <td class="px-3 py-2.5 max-w-[150px] truncate" [class.opacity-50]="t.isDisabled" style="color:var(--text-muted)">{{ t.title }}</td>
                  @if (isPool()) {
                    <td class="px-3 py-2.5 max-w-[140px] truncate" [class.opacity-50]="t.isDisabled" style="color:var(--text-muted)"
                      [title]="t.genres.join(', ')" data-testid="genres">{{ t.genres.join(', ') }}</td>
                    <td class="px-3 py-2.5">
                      @if (t.preview === 'available') {
                        <span class="inline-flex items-center gap-1 text-xs font-medium" style="color:var(--color-success)">
                          <span class="w-1.5 h-1.5 rounded-full shrink-0" style="background:var(--color-success)"></span> {{ 'admin.pool.ok' | translate }}
                        </span>
                      } @else if (t.preview === 'missing') {
                        <span class="inline-flex items-center gap-1 text-xs font-medium" style="color:var(--color-fail)">
                          <span class="w-1.5 h-1.5 rounded-full shrink-0" style="background:var(--color-fail)"></span> {{ 'admin.pool.previewMissing' | translate }}
                        </span>
                      }
                    </td>
                    <td class="px-3 py-2.5">
                      @if (t.isDisabled) {
                        <span class="text-xs px-2 py-0.5 rounded-full whitespace-nowrap" style="color:var(--color-fail);background:var(--bg-inactive)">{{ 'admin.pool.disabled' | translate }}</span>
                      } @else if (t.isUsed) {
                        <span class="text-xs px-2 py-0.5 rounded-full" style="color:var(--text-muted);background:var(--bg-inactive)">{{ 'admin.pool.used' | translate }}</span>
                      } @else {
                        <span class="text-xs px-2 py-0.5 rounded-full" style="color:var(--text-indigo);background:rgb(var(--rgb-violet) / 0.12)">{{ 'admin.pool.available' | translate }}</span>
                      }
                    </td>
                    <td class="px-3 py-2.5">
                      <div class="flex flex-wrap items-center gap-1" data-testid="usage-badges">
                        @for (usage of t.usages; track usage.mode) {
                          <span class="text-xs px-2 py-0.5 rounded-full whitespace-nowrap" data-testid="usage-badge"
                            style="color:var(--text-indigo);background:rgb(var(--rgb-violet) / 0.12)">{{ modeLabelKey(usage) | translate }}</span>
                        }
                        @if (!t.isUsed) {
                          <span class="text-xs" style="color:var(--text-muted)">{{ 'admin.pool.neverPlayed' | translate }}</span>
                        }
                      </div>
                    </td>
                  } @else {
                    @let usage = usageIn(t);
                    <td class="px-3 py-2.5" style="color:var(--text-muted)">{{ usage?.lastUsedDate ?? '' }}</td>
                    <td class="px-3 py-2.5" style="color:var(--text-muted)">{{ usage?.unlockDate ?? '' }}</td>
                    <td class="px-3 py-2.5" style="color:var(--text-muted)">{{ usage?.usageCount ?? 0 }}</td>
                  }
                </tr>
              }
            </tbody>
          </table>
        </div>

        <div class="flex items-center justify-between gap-2 px-4 py-3" style="border-top:1px solid var(--border-medium)">
          <span class="text-xs" style="color:var(--text-muted)">
            {{ filteredCount() }}
            @if (filteredCount() !== totalCount()) { / {{ totalCount() }} }
            {{ 'admin.pool.tracksCount' | translate }}
            @if (pages() > 1) { - {{ 'admin.pool.page' | translate: { current: page() + 1, total: pages() } }} }
          </span>
          @if (pages() > 1) {
            <div class="flex items-center gap-1">
              <button type="button" (click)="previousPage.emit()" [disabled]="page() === 0"
                class="px-2.5 py-1 text-xs rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                style="background:var(--bg-inactive);color:var(--text-hi)">←</button>
              <button type="button" (click)="nextPage.emit()" [disabled]="page() >= pages() - 1"
                class="px-2.5 py-1 text-xs rounded transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                style="background:var(--bg-inactive);color:var(--text-hi)">→</button>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class PoolTableComponent {
  /** Les morceaux de la page affichée, déjà filtrés et triés. */
  readonly tracks = input.required<readonly PoolTrack[]>();
  /** La vue affichée : `pool` (le catalogue, avec ses actions) ou l'identifiant d'un mode (lecture seule). */
  readonly view = input<string>(POOL_VIEW);
  readonly selectedIds = input.required<readonly number[]>();
  readonly togglingIds = input.required<readonly number[]>();
  readonly sort = input.required<PoolSort | null>();
  /** Page affichée, à partir de 0. */
  readonly page = input.required<number>();
  readonly pages = input.required<number>();
  /** Morceaux qui passent les filtres, et morceaux du pool en tout. */
  readonly filteredCount = input.required<number>();
  readonly totalCount = input.required<number>();
  readonly loading = input(false);

  readonly sortBy = output<SortColumn>();
  readonly toggleSelection = output<number>();
  readonly listen = output<PoolTrack>();
  readonly edit = output<PoolTrack>();
  readonly toggleDisabled = output<PoolTrack>();
  readonly delete = output<PoolTrack>();
  readonly openInPool = output<PoolTrack>();
  readonly previousPage = output();
  readonly nextPage = output();

  protected readonly isPool = computed(() => this.view() === POOL_VIEW);
  protected readonly columns = computed(() => (this.isPool() ? POOL_COLUMNS : MODE_COLUMNS));
  protected readonly label = trackLabel;

  /** Ce que le mode de la vue dit du morceau. */
  protected usageIn(track: PoolTrack): ModeUsage | null {
    return usageOf(track, this.view());
  }

  /** Le libellé d'un mode : celui du registre, sinon son nom tel que le back le donne. */
  protected modeLabelKey(usage: ModeUsage): string {
    return modeView(usage.mode)?.labelKey ?? usage.mode;
  }

  protected ariaSort(column: SortColumn): 'ascending' | 'descending' | 'none' {
    const sort = this.sort();
    if (sort?.column !== column) return 'none';
    return sort.direction === 'asc' ? 'ascending' : 'descending';
  }
}
