import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, input, output, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonComponent } from '../../../ui/button/button.component';
import { PointsPipe } from '../../../ui/format/points.pipe';
import { SecondsPipe } from '../../../ui/format/seconds.pipe';
import { enterCard, tweenNumber } from '../../../ui/motion/motion';
import { RunRoundSummary, lifeDots, outcomeKey } from '../../domain/run';

/**
 * Le bilan d'une manche terminée : son score qui monte, les vies qui restent, ce que dit la manche du palier d'écoute suivant (plus court sans
 * erreur, plus long avec une erreur, le même au premier palier) et le palier de la manche à venir, puis « Manche suivante » à portée du pouce.
 * Présentation seule : la page relaie le geste au store.
 */
@Component({
  selector: 'app-run-palier',
  imports: [TranslatePipe, ButtonComponent, PointsPipe, SecondsPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="flex flex-col gap-5 items-center text-center pt-6" data-testid="run-palier">
      <h2 class="text-[15px] font-bold" style="font-family:var(--font-display);color:var(--text-hi)" data-testid="run-palier-title">
        {{ 'runs.roundEnd.title' | translate: { round: end().round } }}
      </h2>
      <p class="text-[56px] font-extrabold leading-none tabular-nums" style="font-family:var(--font-score);color:var(--color-accent)" data-testid="run-palier-score">
        <span #score>{{ end().score | appPoints }}</span>
      </p>
      <div #card class="flex flex-col gap-3 items-center w-full px-4 py-4"
        style="background:var(--bg-surface);border:1px solid var(--border-medium);border-radius:var(--radius-card)">
        <p class="text-[15px]" style="color:var(--text-hi)" data-testid="run-palier-outcome">{{ outcomeText() | translate }}</p>
        <p class="text-[15px]" style="color:var(--color-accent-2)" data-testid="run-palier-next">
          {{ 'runs.roundEnd.nextListen' | translate: { round: end().round + 1, seconds: (end().nextListenSeconds | appSeconds) } }}
        </p>
        <p class="flex items-center gap-1.5" data-testid="run-palier-lives" [attr.aria-label]="'runs.header.lives' | translate: { left: end().livesLeft, total: dots().length }">
          @for (alive of dots(); track $index) {
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M12 21 C5 15.5 2.5 12 2.5 8.5 A4.8 4.8 0 0 1 12 6.6 A4.8 4.8 0 0 1 21.5 8.5 C21.5 12 19 15.5 12 21 Z"
                [attr.fill]="alive ? 'var(--color-accent)' : 'none'" [attr.stroke]="alive ? 'var(--color-accent)' : 'var(--text-faint)'" stroke-width="1.8" stroke-linejoin="round" />
            </svg>
          }
        </p>
      </div>
      <div class="w-full sticky bottom-4 mt-2">
        <button appButton type="button" size="lg" [block]="true" [disabled]="busy()" (click)="next.emit()" data-testid="run-palier-next-button">
          {{ 'runs.roundEnd.next' | translate }}
        </button>
      </div>
    </section>
  `,
})
export class RunPalierComponent {
  /** Le bilan de la manche qui vient de finir. */
  readonly end = input.required<RunRoundSummary>();
  /** Les vies de départ de la partie. */
  readonly lives = input.required<number>();
  /** « Manche suivante » part : rien d'autre ne se touche. */
  readonly busy = input(false);

  readonly next = output();

  protected readonly dots = () => lifeDots(this.lives(), this.end().livesLeft);
  protected readonly outcomeText = () => outcomeKey(this.end().outcome);

  private readonly card = viewChild<ElementRef<HTMLElement>>('card');
  private readonly score = viewChild<ElementRef<HTMLElement>>('score');

  constructor() {
    // Le score monte, le bilan se pose (rien en mouvement réduit : la façade s'en charge).
    afterNextRender(() => {
      const score = this.score()?.nativeElement;
      if (score) tweenNumber(score, 0, this.end().score, 0.2);
      const card = this.card()?.nativeElement;
      if (card) enterCard(card);
    });
  }
}
