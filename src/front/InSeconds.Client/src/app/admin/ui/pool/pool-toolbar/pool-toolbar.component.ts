import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { CooldownTone } from '../../../domain/actions';
import { POOL_VIEW } from '../../../domain/pool-views';

const COOLDOWN_COLOR: Record<CooldownTone, string> = {
  low: 'var(--color-fail)',
  medium: 'var(--bg-warn)',
  high: 'var(--color-success)',
};

/**
 * Barre d'outils du pool. Dans la vue générale : le décompte neutre (morceaux, désactivés, sans extrait) ou, quand des
 * morceaux sont sélectionnés, leur nombre et la suppression groupée ; et le bouton qui ouvre ou ferme le panneau d'ajout.
 * Dans la vue d'un mode (lecture seule) : disponibles et utilisés par ce mode, désactivés et, pour le Daily, le
 * cooldown appliqué aujourd'hui, coloré selon le seuil d'alerte.
 */
@Component({
  selector: 'app-pool-toolbar',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-wrap items-center justify-between gap-3">
      @if (isPool() && selectedCount() > 0) {
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
        <span class="text-xs" style="color:var(--text-muted)" data-testid="pool-counts">
          @if (isPool()) {
            {{ 'admin.pool.totalCount' | translate: { count: totalCount() } }}
          } @else {
            {{ 'admin.pool.availableUsed' | translate: { available: availableCount(), used: usedCount() } }}
          }
          @if (disabledCount() > 0) { · {{ 'admin.pool.disabledCount' | translate: { count: disabledCount() } }} }
          @if (isPool() && missingPreviewCount() > 0) { · {{ 'admin.pool.missingPreviewCount' | translate: { count: missingPreviewCount() } }} }
          @if (!isPool() && cooldownDays() !== null) {
            · <span data-testid="pool-cooldown" [style.color]="cooldownColor()" [title]="'admin.pool.cooldownHint' | translate">{{ 'admin.pool.cooldown' | translate: { days: cooldownDays() } }}</span>
          }
        </span>
      }
      @if (isPool()) {
        <button type="button" (click)="toggleAdd.emit()"
          class="text-sm font-medium px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1 shrink-0"
          style="background:var(--bg-inactive);color:var(--text-light);border:1px solid var(--border-strong)">
          {{ (addPanelOpen() ? 'admin.pool.close' : 'admin.pool.add') | translate }}
        </button>
      }
    </div>
  `,
})
export class PoolToolbarComponent {
  /** La vue affichée : `pool`, ou l'identifiant d'un mode. */
  readonly view = input.required<string>();
  readonly selectedCount = input.required<number>();
  readonly selectionHasUsedTrack = input.required<boolean>();
  readonly totalCount = input.required<number>();
  readonly availableCount = input.required<number>();
  readonly usedCount = input.required<number>();
  readonly disabledCount = input.required<number>();
  readonly missingPreviewCount = input.required<number>();
  /** Le cooldown appliqué aujourd'hui, en jours ; `null` s'il n'est pas lu (rien n'est affiché). */
  readonly cooldownDays = input.required<number | null>();
  readonly cooldownTone = input.required<CooldownTone | null>();
  readonly addPanelOpen = input.required<boolean>();

  readonly deselectAll = output();
  readonly deleteSelection = output();
  readonly toggleAdd = output();

  protected readonly isPool = computed(() => this.view() === POOL_VIEW);
  protected readonly cooldownColor = computed(() => {
    const tone = this.cooldownTone();
    return tone === null ? null : COOLDOWN_COLOR[tone];
  });
}
