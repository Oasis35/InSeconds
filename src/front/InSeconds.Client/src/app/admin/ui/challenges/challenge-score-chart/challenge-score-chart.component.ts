import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ScoreDistributionChartComponent } from '../../../../ui/score-distribution-chart/score-distribution-chart.component';
import { ChallengeStats, challengeScoreChart } from '../../../domain/challenge';

/**
 * « Répartition des scores » d'un défi (PC seulement, Accueil et détail de l'onglet Défis, au même endroit : avant les joueurs) : un titre,
 * la moyenne, puis l'égaliseur du joueur, tout en violet (l'admin connecté n'y est pas mis en valeur). Rien tant que personne n'a fini.
 */
@Component({
  selector: 'app-challenge-score-chart',
  imports: [TranslatePipe, ScoreDistributionChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = challenge();
    @if (c.scoreMin !== null) {
      <div class="flex flex-col gap-2" [class.pt-3]="ruled()" [style.border-top]="ruled() ? '1px solid var(--border-medium)' : null"
        data-testid="challenge-score-chart">
        <div class="flex items-baseline justify-between text-xs" style="color:var(--text-muted)">
          <span class="font-semibold">{{ 'admin.challenges.scoreChart' | translate }}</span>
          <span>{{ 'admin.dashboard.avg' | translate }} <span class="font-medium" style="color:var(--text-light)">{{ c.scoreAvg }}</span></span>
        </div>
        <div class="w-full max-w-md mx-auto py-1">
          <app-score-distribution-chart [stats]="chart()" [showBetterThan]="false" />
        </div>
      </div>
    }
  `,
})
export class ChallengeScoreChartComponent {
  readonly challenge = input.required<ChallengeStats>();
  /** Un trait le sépare de ce qui précède (sauf en tête de sa carte). */
  readonly ruled = input(true);
  protected readonly chart = computed(() => challengeScoreChart(this.challenge()));
}
