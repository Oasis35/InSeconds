import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, inject, input, linkedSignal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { SecondsPipe } from '../../../ui/format/seconds.pipe';
import { PointsPipe } from '../../../ui/format/points.pipe';
import { explainScore } from '../../../ui/motion/motion';
import { ScoreBreakdown } from '../../domain/score-breakdown';

/**
 * Ce que vaut le morceau, d'un coup d'œil, sous le score de la révélation : une barre (ce qui est gagné sur ce que le palier pouvait donner,
 * le reste en rouge) et sa légende (« sur 850 pts possibles », ou « Maximum possible à 1 s » quand tout est gagné). Quand quelque chose a
 * réduit les points, un lien « Pourquoi ? » déplie les pastilles de la cause (« ✕ Titre raté · ÷ 2 », « Indice · − 30 % »). Les deux lignes
 * du haut se posent l'une après l'autre ; le score du morceau descend ensuite jusqu'à son résultat.
 */
@Component({
  selector: 'app-score-breakdown',
  imports: [TranslatePipe, SecondsPipe, PointsPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block w-full' },
  template: `
    @if (breakdown(); as b) {
      <div class="mx-auto flex flex-col items-center gap-1.5" style="max-width:15rem" data-testid="score-breakdown">
        <div class="w-full h-2.5 rounded-full overflow-hidden flex" style="background:color-mix(in srgb, var(--color-fail) 35%, transparent)"
          role="img" [attr.aria-label]="'daily.round.breakdown.bar' | translate: { score: (b.score | appPoints), base: (b.base | appPoints) }"
          data-motion="breakdown-line" data-testid="breakdown-bar">
          <div class="h-full" style="background:var(--color-accent-3)" [style.width.%]="percent()"></div>
        </div>
        <p class="m-0 text-[13px] tabular-nums" style="color:var(--text-muted)" data-motion="breakdown-line" data-testid="breakdown-base">
          @if (reduced()) {
            {{ 'daily.round.breakdown.outOf' | translate: { points: (b.base | appPoints) } }}
          } @else {
            {{ 'daily.round.breakdown.max' | translate: { seconds: (b.seconds | appSeconds) } }}
          }
        </p>
        @if (reduced()) {
          <button type="button" class="text-[13px] underline py-3 -my-2" style="color:var(--text-light)" data-testid="breakdown-why"
            [attr.aria-expanded]="open()" (click)="open.set(!open())">{{ 'daily.round.breakdown.why' | translate }}</button>
          @if (open()) {
            <div class="flex flex-wrap justify-center gap-1.5" data-testid="breakdown-causes">
              @if (b.missed) {
                <span class="rounded-full border px-2.5 py-0.5 text-[13px]" style="color:var(--color-fail);border-color:var(--color-fail)">
                  ✕ {{ (b.missed === 'title' ? 'daily.round.breakdown.missedTitle' : 'daily.round.breakdown.missedArtist') | translate }}
                  · {{ 'daily.round.breakdown.half' | translate }}
                </span>
              }
              @if (b.hintPenaltyPercent > 0) {
                <span class="rounded-full border px-2.5 py-0.5 text-[13px]" style="color:var(--text-muted);border-color:var(--border-neutral)">
                  {{ 'daily.round.breakdown.hint' | translate }} · {{ 'daily.round.breakdown.hintPenalty' | translate: { percent: b.hintPenaltyPercent } }}
                </span>
              }
            </div>
          }
        }
      </div>
    }
  `,
})
export class ScoreBreakdownComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly breakdown = input.required<ScoreBreakdown | null>();

  /** Les pastilles de la cause : fermées à chaque nouveau morceau. */
  protected readonly open = linkedSignal<ScoreBreakdown | null, boolean>({ source: this.breakdown, computation: () => false });
  /** Vrai quand quelque chose a réduit les points (un seul des deux trouvé, ou un indice pris). */
  protected readonly reduced = computed(() => {
    const b = this.breakdown();
    return b !== null && (b.missed !== null || b.hintPenaltyPercent > 0);
  });
  /** La part gagnée du barème, en pourcentage de la barre. */
  protected readonly percent = computed(() => {
    const b = this.breakdown();
    return b && b.base > 0 ? Math.min(100, Math.max(0, (b.score / b.base) * 100)) : 0;
  });

  constructor() {
    afterRenderEffect(() => {
      if (this.breakdown()) explainScore(Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('[data-motion="breakdown-line"]')));
    });
  }
}
