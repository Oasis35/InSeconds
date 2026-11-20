import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { formatPoints } from '../../../ui/format/format-points';
import { ProfilePoint, chartBounds, chartLine } from '../../domain/ear-profile';

/**
 * La courbe du profil d'oreille : sa moyenne (ambre, c'est le joueur), et en pointillé violet celle des joueurs (les autres), un point par semaine
 * ou par mois. Une période sans partie laisse un trou. Le nom accessible dit d'où à où va sa moyenne.
 */
@Component({
  selector: 'app-ear-profile-chart',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (lines(); as l) {
      <svg class="w-full block" [attr.height]="height()" [attr.viewBox]="'0 0 ' + width + ' ' + height()" preserveAspectRatio="none" role="img"
           [attr.aria-label]="'daily.profile.chartLabel' | translate: { from: l.from, to: l.to }" data-testid="ear-profile-chart">
        @if (l.players) {
          <polyline [attr.points]="l.players" fill="none" style="stroke:var(--color-violet)" stroke-width="1.5" stroke-dasharray="4 4" vector-effect="non-scaling-stroke" />
        }
        <polyline [attr.points]="l.mine" fill="none" style="stroke:var(--color-accent-3)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" vector-effect="non-scaling-stroke" />
        @if (l.last; as last) {
          <!-- Un segment de longueur nulle à bout rond : il reste rond malgré preserveAspectRatio="none" (un cercle s'écraserait). -->
          <polyline [attr.points]="last.x + ',' + last.y + ' ' + last.x + ',' + last.y" fill="none" style="stroke:var(--color-accent-3)" stroke-width="7" stroke-linecap="round" vector-effect="non-scaling-stroke" />
        }
      </svg>
    }
  `,
})
export class EarProfileChartComponent {
  readonly points = input.required<readonly ProfilePoint[]>();
  readonly height = input(100);
  readonly lang = input<'fr' | 'en'>('fr');

  protected readonly width = 320;

  protected readonly lines = computed(() => {
    const points = this.points();
    const bounds = chartBounds(points);
    if (!bounds) return null;
    const mine = chartLine(points.map(p => p.average), bounds.min, bounds.max, this.width, this.height());
    const players = chartLine(points.map(p => p.playersAverage), bounds.min, bounds.max, this.width, this.height());
    const played = points.filter(p => p.average !== null);
    return {
      mine: mine.points,
      last: mine.last,
      players: players.points,
      from: formatPoints(played[0]?.average ?? 0, this.lang()),
      to: formatPoints(played.at(-1)?.average ?? 0, this.lang()),
    };
  });
}
