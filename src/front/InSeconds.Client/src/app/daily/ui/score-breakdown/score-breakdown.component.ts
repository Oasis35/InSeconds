import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, inject, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { SecondsPipe } from '../../../ui/format/seconds.pipe';
import { PointsPipe } from '../../../ui/format/points.pipe';
import { explainScore } from '../../../ui/motion/motion';
import { ScoreBreakdown } from '../../domain/score-breakdown';

/**
 * Le calcul des points d'un morceau, sous le score de la révélation : « Écoute à 1 s : 850 », puis ce qui les réduit (« Titre manqué ÷ 2 »,
 * « Indice − 30 % »). Les lignes se posent l'une après l'autre ; le score du morceau descend ensuite jusqu'à son résultat.
 */
@Component({
  selector: 'app-score-breakdown',
  imports: [TranslatePipe, SecondsPipe, PointsPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full' },
  template: `
    @if (breakdown(); as b) {
      <ul class="mx-auto flex flex-col gap-0.5 text-[13px] tabular-nums list-none p-0 m-0" style="max-width:16rem;color:var(--text-muted)" data-testid="score-breakdown">
        <li class="flex justify-between gap-4" data-motion="breakdown-line">
          <span>{{ 'daily.round.breakdown.listen' | translate: { seconds: (b.seconds | appSeconds) } }}</span>
          <span data-testid="breakdown-base">{{ b.base | appPoints }}</span>
        </li>
        @if (b.missed) {
          <li class="flex justify-between gap-4" data-motion="breakdown-line">
            <span>{{ (b.missed === 'title' ? 'daily.round.breakdown.missedTitle' : 'daily.round.breakdown.missedArtist') | translate }}</span>
            <span>{{ 'daily.round.breakdown.half' | translate }}</span>
          </li>
        }
        @if (b.hintPenaltyPercent > 0) {
          <li class="flex justify-between gap-4" data-motion="breakdown-line">
            <span>{{ 'daily.round.breakdown.hint' | translate }}</span>
            <span>{{ 'daily.round.breakdown.hintPenalty' | translate: { percent: b.hintPenaltyPercent } }}</span>
          </li>
        }
      </ul>
    }
  `,
})
export class ScoreBreakdownComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly breakdown = input.required<ScoreBreakdown | null>();

  constructor() {
    afterRenderEffect(() => {
      if (this.breakdown()) explainScore(Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('[data-motion="breakdown-line"]')));
    });
  }
}
