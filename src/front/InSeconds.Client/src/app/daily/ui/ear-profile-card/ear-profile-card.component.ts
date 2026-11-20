import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { PointsPipe } from '../../../ui/format/points.pipe';
import { SecondsPipe } from '../../../ui/format/seconds.pipe';
import { EarProfile, favouriteStep } from '../../domain/ear-profile';
import { EarProfileChartComponent } from '../ear-profile-chart/ear-profile-chart.component';

/**
 * La carte « Ton profil d'oreille » de l'historique : sa moyenne des 8 dernières semaines et sa tendance, la courbe face aux joueurs, puis trois
 * chiffres (meilleure série, trouvés au premier palier, palier le plus fréquent). Toute la carte mène à la page du profil.
 */
@Component({
  selector: 'app-ear-profile-card',
  imports: [RouterLink, TranslatePipe, PointsPipe, SecondsPipe, EarProfileChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/history/daily/profil" class="flex flex-col gap-3 p-4 touch-manipulation" data-testid="ear-profile-card"
       style="background:var(--bg-surface);border:1px solid var(--border-medium);border-radius:var(--radius-card)">
      <span class="flex items-center justify-between">
        <span class="text-base font-semibold" style="font-family:var(--font-display);color:var(--text-hi)">{{ 'daily.profile.title' | translate }}</span>
        <span class="text-[13px]" style="color:var(--text-light)">{{ 'daily.profile.seeAll' | translate }} <span aria-hidden="true">›</span></span>
      </span>
      <span class="flex items-end gap-3.5">
        <span class="flex flex-col gap-0.5 shrink-0">
          <span class="text-xs" style="color:var(--text-muted)">{{ 'daily.profile.averageEightWeeks' | translate }}</span>
          <span class="text-[30px] font-extrabold leading-none tabular-nums" style="font-family:var(--font-score);color:var(--color-accent-3)" data-testid="ear-profile-card-average">{{ profile().averageScore | appPoints }}</span>
          @if (profile().trendPercent !== null) {
            <span class="text-xs font-semibold" style="color:var(--color-accent-3)" data-testid="ear-profile-card-trend">{{ 'daily.profile.trend' | translate: { value: trend() } }}</span>
          }
        </span>
        <app-ear-profile-chart class="flex-1 min-w-0" [points]="profile().points" [height]="64" />
      </span>
      <span class="grid grid-cols-3 gap-2 pt-3" style="border-top:1px solid var(--border-medium)">
        <span class="flex flex-col gap-0.5">
          <b class="text-lg tabular-nums" style="font-family:var(--font-score);color:var(--text-hi)">{{ 'daily.profile.days' | translate: { count: profile().bestStreak } }}</b>
          <span class="text-[11px]" style="color:var(--text-muted)">{{ 'daily.profile.bestStreak' | translate }}</span>
        </span>
        <span class="flex flex-col gap-0.5">
          <b class="text-lg tabular-nums" style="font-family:var(--font-score);color:var(--text-hi)">{{ profile().firstStepFound }}</b>
          <span class="text-[11px]" style="color:var(--text-muted)">{{ 'daily.profile.foundAt' | translate: { seconds: (profile().firstStepSeconds | appSeconds) } }}</span>
        </span>
        <span class="flex flex-col gap-0.5">
          <b class="text-lg tabular-nums" style="font-family:var(--font-score);color:var(--text-hi)">{{ favourite() === null ? '-' : (favourite()! | appSeconds) }}</b>
          <span class="text-[11px]" style="color:var(--text-muted)">{{ 'daily.profile.favouriteStep' | translate }}</span>
        </span>
      </span>
    </a>
  `,
})
export class EarProfileCardComponent {
  readonly profile = input.required<EarProfile>();

  protected readonly favourite = computed(() => favouriteStep(this.profile().steps));

  /** « +12 % » ou « -3 % ». */
  protected readonly trend = computed(() => {
    const value = this.profile().trendPercent ?? 0;
    return `${value > 0 ? '+' : ''}${value}`;
  });
}
