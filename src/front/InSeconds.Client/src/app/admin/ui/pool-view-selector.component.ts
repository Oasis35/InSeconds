import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { MODE_VIEWS, POOL_VIEW } from '../domain/pool-views';

/**
 * Sélecteur de vue du pool : le pool général puis une vue par mode de jeu. Une seule ligne qui défile à l'horizontale
 * quand elle ne tient pas (téléphone) ; chaque mode du registre `MODE_VIEWS` y apparaît sans autre changement.
 */
@Component({
  selector: 'app-pool-view-selector',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex gap-1 p-1 rounded-lg overflow-x-auto" style="background:var(--bg-surface)"
      role="tablist" [attr.aria-label]="'admin.pool.views.label' | translate">
      <button type="button" role="tab" [attr.aria-selected]="view() === poolView" (click)="viewChange.emit(poolView)"
        class="pool-view shrink-0 py-1.5 px-3 rounded-md text-xs sm:text-sm font-medium whitespace-nowrap transition-colors"
        [class.is-active]="view() === poolView">
        {{ 'admin.pool.views.pool' | translate }}
      </button>
      @for (mode of modes; track mode.id) {
        <button type="button" role="tab" [attr.aria-selected]="view() === mode.id" (click)="viewChange.emit(mode.id)"
          class="pool-view shrink-0 py-1.5 px-3 rounded-md text-xs sm:text-sm font-medium whitespace-nowrap transition-colors"
          [class.is-active]="view() === mode.id">
          {{ mode.labelKey | translate }}
        </button>
      }
    </div>
  `,
  styles: `
    .pool-view { color: var(--text-muted); }
    .pool-view.is-active { color: var(--text-hi); background: var(--bg-inactive); }
  `,
})
export class PoolViewSelectorComponent {
  readonly view = input.required<string>();
  readonly viewChange = output<string>();

  protected readonly poolView = POOL_VIEW;
  protected readonly modes = MODE_VIEWS;
}
