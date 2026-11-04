import { DecimalPipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { StreakBuckets } from '../../../domain/registered-player';

/**
 * En haut de l'onglet Joueurs : les séries en cours des comptes (1 jour, 2 à 6, 7 et plus) et la part des joueurs d'un jour, invités
 * compris, revenus le lendemain (moyenne sur 30 jours).
 */
@Component({
  selector: 'app-players-loyalty',
  imports: [DecimalPipe, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rounded-xl p-4 flex flex-col gap-2" style="background:var(--bg-surface)" data-testid="players-loyalty">
      <div class="flex items-baseline justify-between gap-2 text-xs" style="color:var(--text-muted)">
        <span class="font-semibold">{{ 'admin.players.streaksTitle' | translate }}</span>
        <span><span class="font-semibold tabular-nums" style="color:var(--text-hi)">{{ streaks().total }}</span> {{ 'admin.players.withStreak' | translate }}</span>
      </div>
      <div class="grid grid-cols-3 gap-2 text-center">
        @for (bucket of buckets(); track bucket.key) {
          <div class="rounded-lg py-2" style="background:var(--bg-inactive)" [attr.data-testid]="'streak-' + bucket.key">
            <p class="text-lg font-bold leading-tight tabular-nums" style="color:var(--text-hi)">{{ bucket.count }}</p>
            <p class="text-xs" style="color:var(--text-muted)">{{ 'admin.players.streak.' + bucket.key | translate }}</p>
          </div>
        }
      </div>
      @let rate = nextDayReturnRate();
      @if (rate !== null) {
        <p class="text-xs" style="color:var(--text-muted)" data-testid="next-day-return">
          {{ 'admin.players.nextDayReturn' | translate }}
          <span class="font-semibold tabular-nums" style="color:var(--text-hi)">{{ rate | number: '1.0-0' }} %</span>
          {{ 'admin.players.nextDayReturnHint' | translate }}
        </p>
      }
    </div>
  `,
})
export class PlayersLoyaltyComponent {
  readonly streaks = input.required<StreakBuckets>();
  /** En pourcentage ; rien d'affiché sans valeur. */
  readonly nextDayReturnRate = input<number | null>(null);

  protected buckets() {
    const s = this.streaks();
    return [{ key: 'oneDay', count: s.oneDay }, { key: 'short', count: s.short }, { key: 'long', count: s.long }];
  }
}
