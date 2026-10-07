import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { PoolFilters, PreviewFilter, StatusFilter, hasActiveFilters } from '../domain/pool-filters';

const FIELD_STYLE = 'background:var(--bg-surface);color:var(--text-light)';

/**
 * Filtres du tableau : texte (artiste, titre, ou les deux collés), état de l'extrait, statut,
 * plage de dernière utilisation. Chaque champ a son libellé (masqué à l'écran, lu par les lecteurs
 * d'écran).
 */
@Component({
  selector: 'app-pool-filter-bar',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center gap-2">
      <label for="pool-filter-text" class="sr-only">{{ 'admin.pool.searchPlaceholder' | translate }}</label>
      <input id="pool-filter-text" type="text" [value]="filters().text"
        (input)="textChange.emit($any($event.target).value)"
        [placeholder]="'admin.pool.searchPlaceholder' | translate"
        class="flex-1 min-w-36 text-sm rounded-lg px-3 py-1.5 outline-none"
        style="background:var(--bg-surface);color:var(--text-hi)" />

      <label for="pool-filter-preview" class="sr-only">{{ 'admin.pool.allPreviews' | translate }}</label>
      <select id="pool-filter-preview" [value]="filters().preview" (change)="previewChange.emit($any($event.target).value)"
        class="text-sm rounded-lg px-3 py-1.5 outline-none cursor-pointer" [style]="fieldStyle">
        <option value="all">{{ 'admin.pool.allPreviews' | translate }}</option>
        <option value="ok">{{ 'admin.pool.previewOk' | translate }}</option>
        <option value="missing">{{ 'admin.pool.previewMissing' | translate }}</option>
      </select>

      <label for="pool-filter-status" class="sr-only">{{ 'admin.pool.allStatuses' | translate }}</label>
      <select id="pool-filter-status" [value]="filters().status" (change)="statusChange.emit($any($event.target).value)"
        class="text-sm rounded-lg px-3 py-1.5 outline-none cursor-pointer" [style]="fieldStyle">
        <option value="all">{{ 'admin.pool.allStatuses' | translate }}</option>
        <option value="available">{{ 'admin.pool.available' | translate }}</option>
        <option value="used">{{ 'admin.pool.used' | translate }}</option>
        <option value="disabled">{{ 'admin.pool.disabledFilter' | translate }}</option>
      </select>

      <label for="pool-filter-lastused-from" class="sr-only">{{ 'admin.pool.lastUsedFrom' | translate }}</label>
      <input id="pool-filter-lastused-from" type="date" [value]="filters().lastUsedFrom"
        (change)="lastUsedFromChange.emit($any($event.target).value)"
        [title]="'admin.pool.lastUsedFrom' | translate"
        class="text-sm rounded-lg px-3 py-1.5 outline-none" [style]="fieldStyle" />

      <label for="pool-filter-lastused-to" class="sr-only">{{ 'admin.pool.lastUsedTo' | translate }}</label>
      <input id="pool-filter-lastused-to" type="date" [value]="filters().lastUsedTo"
        (change)="lastUsedToChange.emit($any($event.target).value)"
        [title]="'admin.pool.lastUsedTo' | translate"
        class="text-sm rounded-lg px-3 py-1.5 outline-none" [style]="fieldStyle" />

      @if (active()) {
        <button type="button" (click)="reset.emit()" class="text-xs transition-colors px-1" style="color:var(--text-muted)">
          {{ 'admin.pool.resetFilters' | translate }}
        </button>
      }
    </div>
  `,
})
export class PoolFilterBarComponent {
  readonly filters = input.required<PoolFilters>();

  readonly textChange = output<string>();
  readonly previewChange = output<PreviewFilter>();
  readonly statusChange = output<StatusFilter>();
  readonly lastUsedFromChange = output<string>();
  readonly lastUsedToChange = output<string>();
  readonly reset = output();

  protected readonly fieldStyle = FIELD_STYLE;
  protected readonly active = computed(() => hasActiveFilters(this.filters()));
}
