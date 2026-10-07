import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { RunwayTone } from '../domain/pool-filters';

const RUNWAY_COLOR: Record<RunwayTone, string> = {
  low: 'var(--color-fail)',
  medium: 'var(--bg-warn)',
  high: 'var(--color-success)',
};

/**
 * Barre d'outils du pool : le décompte (disponibles, utilisés, désactivés, autonomie en jours de
 * défis) ou, quand des morceaux sont sélectionnés, leur nombre et la suppression groupée ; et le
 * bouton qui ouvre ou ferme le panneau d'ajout.
 */
@Component({
  selector: 'app-pool-toolbar',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center justify-between gap-3">
      @if (selectedCount() > 0) {
        <div class="flex flex-wrap items-center gap-3">
          <span class="text-xs" style="color:var(--text-light)">{{ 'admin.pool.selected' | translate: { count: selectedCount() } }}</span>
          <button type="button" (click)="deselectAll.emit()" class="text-xs transition-colors" style="color:var(--text-muted)">
            {{ 'admin.pool.deselectAll' | translate }}
          </button>
          <span [title]="selectionHasUsedTrack() ? ('admin.pool.deleteUsedSelection' | translate) : ''">
            <button type="button" (click)="deleteSelection.emit()" [disabled]="selectionHasUsedTrack()"
              class="text-xs font-medium px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
              style="background:var(--bg-danger);color:var(--text-on-primary)">
              {{ 'admin.pool.delete' | translate: { count: selectedCount() } }}
            </button>
          </span>
        </div>
      } @else {
        <span class="text-xs" style="color:var(--text-muted)">
          {{ 'admin.pool.availableUsed' | translate: { available: availableCount(), used: usedCount() } }}
          @if (disabledCount() > 0) { · {{ 'admin.pool.disabledCount' | translate: { count: disabledCount() } }} }
          · <span [style.color]="runwayColor()">{{ runwayDays() }} {{ (runwayDays() > 1 ? 'admin.pool.runwayDays' : 'admin.pool.runwayDay') | translate }}</span>
        </span>
      }
      <button type="button" (click)="toggleAdd.emit()"
        class="text-sm font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 shrink-0"
        style="background:var(--bg-inactive);color:var(--text-light);border:1px solid var(--border-strong)">
        {{ (addPanelOpen() ? 'admin.pool.close' : 'admin.pool.add') | translate }}
      </button>
    </div>
  `,
})
export class PoolToolbarComponent {
  readonly selectedCount = input.required<number>();
  readonly selectionHasUsedTrack = input.required<boolean>();
  readonly availableCount = input.required<number>();
  readonly usedCount = input.required<number>();
  readonly disabledCount = input.required<number>();
  readonly runwayDays = input.required<number>();
  readonly runwayTone = input.required<RunwayTone>();
  readonly addPanelOpen = input.required<boolean>();

  readonly deselectAll = output();
  readonly deleteSelection = output();
  readonly toggleAdd = output();

  protected readonly runwayColor = computed(() => RUNWAY_COLOR[this.runwayTone()]);
}
