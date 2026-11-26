import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { CohortRow, day1Rate, day7Rate } from '../../../domain/stats';

/**
 * « Ils reviennent ? » : une ligne par groupe (source ou appareil) avec les nouveaux joueurs et la part revenue le lendemain (J+1) et une
 * semaine après (J+7). Un taux n'existe que si quelqu'un a eu le temps de revenir (« · » sinon). `labelPrefix` donne la clé i18n d'une
 * clé connue (`admin.sources`, `admin.stats.devices`) ; une clé inconnue (un domaine) s'affiche telle quelle.
 */
@Component({
  selector: 'app-stats-cohort-table',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col text-sm" data-testid="cohort-table">
      <div class="grid grid-cols-[1fr_3rem_3.5rem_3.5rem] gap-2 pb-1 text-xs" style="color:var(--text-muted)">
        <span></span>
        <span class="text-right">{{ 'admin.stats.colNew' | translate }}</span>
        <span class="text-right">{{ 'admin.stats.colDay1' | translate }}</span>
        <span class="text-right">{{ 'admin.stats.colDay7' | translate }}</span>
      </div>
      @for (row of rows(); track row.key) {
        <div class="grid grid-cols-[1fr_3rem_3.5rem_3.5rem] gap-2 py-1.5 border-t items-baseline" style="border-color:var(--text-sep)" data-testid="cohort-row">
          <span class="truncate" style="color:var(--text-hi)">{{ isKnown(row.key) ? ((labelPrefix() + '.' + row.key) | translate) : row.key }}</span>
          <span class="text-right tabular-nums">{{ row.newPlayers }}</span>
          <span class="text-right tabular-nums" [style.color]="color(day1(row))">{{ format(day1(row)) }}</span>
          <span class="text-right tabular-nums" [style.color]="color(day7(row))">{{ format(day7(row)) }}</span>
        </div>
      }
    </div>
  `,
})
export class StatsCohortTableComponent {
  readonly rows = input.required<readonly CohortRow[]>();
  readonly labelPrefix = input.required<string>();
  /** Les clés qui ont un libellé traduit. */
  readonly knownKeys = input<readonly string[]>([]);

  protected isKnown(key: string): boolean {
    return this.knownKeys().includes(key);
  }

  protected day1(row: CohortRow): number | null { return day1Rate(row); }
  protected day7(row: CohortRow): number | null { return day7Rate(row); }
  protected format(rate: number | null): string { return rate === null ? '·' : `${rate} %`; }

  /** Vert à partir de 40 %, jaune de 20 % à 39 %, rouge dessous ; gris sans donnée. */
  protected color(rate: number | null): string {
    if (rate === null) return 'var(--text-muted)';
    if (rate >= 40) return 'var(--color-success)';
    return rate >= 20 ? 'var(--color-warn)' : 'var(--color-fail)';
  }
}
