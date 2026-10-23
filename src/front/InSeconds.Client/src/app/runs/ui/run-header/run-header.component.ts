import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/** L'en-tête d'une manche : « Abandonner », « MANCHE 2 / 4 » et le score total. Présentationnel : l'abandon est confirmé par la page. */
@Component({
  selector: 'app-run-header',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grid grid-cols-[1fr_auto_1fr] items-center gap-2 pt-1">
      <button type="button" (click)="abandon.emit()" class="justify-self-start text-sm underline touch-manipulation"
        style="color:var(--text-muted)" data-testid="run-abandon">
        {{ 'runs.header.abandon' | translate }}
      </button>
      <h1 class="text-sm font-extrabold uppercase tracking-wide text-center" style="font-family:var(--font-display);color:var(--text-hi)" data-testid="run-round-title">
        {{ 'runs.header.round' | translate: { round: round(), rounds: rounds() } }}
      </h1>
      <p class="justify-self-end text-right leading-tight">
        <span class="block text-[0.6875rem]" style="color:var(--text-faint)">{{ 'runs.header.score' | translate }}</span>
        <span class="block text-lg font-extrabold tabular-nums" style="font-family:var(--font-display);color:var(--color-accent)" data-testid="run-total-score">{{ score() }}</span>
      </p>
    </div>
  `,
})
export class RunHeaderComponent {
  /** La manche affichée (à partir de 1) et le nombre de manches de la playlist. */
  readonly round = input.required<number>();
  readonly rounds = input.required<number>();
  /** Le score total de la partie. */
  readonly score = input.required<number>();
  readonly abandon = output();
}
