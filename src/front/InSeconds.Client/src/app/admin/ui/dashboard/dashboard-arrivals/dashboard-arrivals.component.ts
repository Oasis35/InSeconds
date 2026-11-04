import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ArrivalCount, ArrivalShare, arrivalShares, sourceLabelKey } from '../../../domain/dashboard';

/** Teintes des parts, de la plus grosse à « Autres » : du violet (les autres joueurs) qui pâlit, puis un gris. */
const SHARE_STYLES = [
  'background:var(--color-violet)',
  'background:var(--color-violet);opacity:0.7',
  'background:var(--color-violet);opacity:0.45',
];
const REST_STYLE = 'background:var(--text-sep)';

/**
 * « D'où viennent les nouveaux · 30 jours », sous l'activité de l'accueil : les joueurs créés ces 30 jours, une barre empilée des trois
 * sources les plus fréquentes et du reste, et la légende en pourcentages. Rien sans arrivée.
 */
@Component({
  selector: 'app-dashboard-arrivals',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (shares().length > 0) {
      <div class="rounded-xl p-4 flex flex-col gap-2" style="background:var(--bg-surface)" data-testid="dashboard-arrivals">
        <div class="flex items-baseline justify-between gap-2 text-xs" style="color:var(--text-muted)">
          <span class="font-semibold">{{ 'admin.dashboard.arrivalsTitle' | translate }}</span>
          <span><span class="font-semibold tabular-nums" style="color:var(--text-hi)">{{ total() }}</span> {{ 'admin.dashboard.arrivalsCount' | translate }}</span>
        </div>
        <div class="flex h-3 gap-0.5 rounded-full overflow-hidden" aria-hidden="true">
          @for (share of shares(); track share.source; let i = $index) {
            <div [style]="styleOf(share, i) + ';width:' + share.percent + '%'"></div>
          }
        </div>
        <div class="flex flex-wrap gap-x-4 gap-y-1 text-xs" style="color:var(--text-muted)">
          @for (share of shares(); track share.source; let i = $index) {
            <span class="inline-flex items-center gap-1.5" data-testid="arrival-share">
              <i class="inline-block w-2 h-2 rounded-sm" [style]="styleOf(share, i)"></i>
              {{ labelOf(share).key ? (labelOf(share).key! | translate) : labelOf(share).text }}
              <span class="font-semibold tabular-nums" style="color:var(--text-hi)">{{ share.percent }} %</span>
            </span>
          }
        </div>
      </div>
    }
  `,
})
export class DashboardArrivalsComponent {
  readonly arrivals = input.required<readonly ArrivalCount[]>();

  protected readonly shares = computed(() => arrivalShares(this.arrivals()));
  protected readonly total = computed(() => this.arrivals().reduce((sum, a) => sum + a.count, 0));

  protected styleOf(share: ArrivalShare, index: number): string {
    return share.source === null ? REST_STYLE : SHARE_STYLES[index] ?? REST_STYLE;
  }

  protected labelOf(share: ArrivalShare): { key: string | null; text: string } {
    if (share.source === null) return { key: 'admin.sources.rest', text: '' };
    return { key: sourceLabelKey(share.source), text: share.source };
  }
}
