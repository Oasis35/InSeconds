import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { RunRound, objectiveBar, objectiveReached } from '../../domain/run';

/**
 * Le bloc objectif d'une manche : « Débloquer la manche N » (sur la dernière : « Viser le disque d'or » ; au bilan : « Manche N débloquée » ou
 * « Objectif manqué ») avec son cadenas (ouvert une fois l'objectif atteint), le score déjà marqué et
 * l'objectif en points, et la barre avec un trait à l'objectif. `gain` (« +67 ») s'ajoute après une réponse, l'ancien objectif barré après le retrait d'un morceau. Aucun multiplicateur n'est montré.
 */
@Component({
  selector: 'app-run-objective',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="rounded-(--radius-card) px-4 py-3 space-y-2.5" style="background:rgb(var(--rgb-surface) / 0.55);border:1px solid var(--border-subtle)"
      data-testid="run-objective">
      <div class="flex items-center justify-between gap-3">
        <p class="flex items-center gap-2 text-sm font-semibold min-w-0" style="color:var(--text-hi)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"
            aria-hidden="true" [style.color]="reached() ? 'var(--color-success)' : 'var(--text-muted)'">
            <rect x="5" y="11" width="14" height="10" rx="2" />
            @if (reached()) {
              <path d="M8 11V7a4 4 0 0 1 7.5-2" />
            } @else {
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            }
          </svg>
          <span [style.color]="ended() && reached() ? 'var(--color-success)' : null" data-testid="run-objective-label">
            {{ labelKey() | translate: { round: round().round + 1 } }}
          </span>
        </p>
        <p class="text-sm tabular-nums whitespace-nowrap" style="color:var(--text-faint)">
          @if (gain() !== null) {
            <span class="text-xs font-bold mr-1" style="color:var(--color-success)" data-testid="run-gain">{{ gainText() }}</span>
          }
          <span class="font-extrabold" style="color:var(--text-hi)" data-testid="run-score">{{ round().score }}</span>
          /
          @if (previousObjective() !== null) {
            <s class="mr-0.5" data-testid="run-objective-before">{{ previousObjective() }}</s>
          }
          <span data-testid="run-objective-points">{{ round().objective }}</span> {{ 'runs.objective.points' | translate }}
        </p>
      </div>
      <!-- Une manche sans maximum connu (tous ses morceaux retirés) n'a pas de barre. -->
      @if (round().maxScore > 0) {
        <div class="relative h-2.5 rounded-full overflow-hidden" style="background:var(--bg-inactive)" role="progressbar" [attr.aria-valuemin]="0"
          [attr.aria-valuemax]="round().objective" [attr.aria-valuenow]="round().score">
          <div class="absolute inset-y-0 left-0 rounded-full" style="background:var(--gradient-primary)" [style.width.%]="baseRatio() * 100"></div>
          @if (gainRatio() > 0) {
            <div class="absolute inset-y-0" style="background:var(--color-success)" [style.left.%]="baseRatio() * 100" [style.width.%]="gainRatio() * 100"
              data-testid="run-objective-gain"></div>
          }
          <div class="absolute inset-y-0 w-0.5" [style.background]="ended() && reached() ? 'var(--color-success)' : 'var(--text-hi)'" [style.left.%]="bar().objectiveRatio * 100" data-testid="run-objective-tick"></div>
        </div>
      }
    </section>
  `,
})
export class RunObjectiveComponent {
  readonly round = input.required<RunRound>();
  /** Le nombre de manches de la playlist : la dernière ne débloque rien, elle vise le disque d'or. */
  readonly rounds = input.required<number>();
  /** Les points du morceau qu'on vient de répondre, `null` avant la réponse. */
  readonly gain = input<number | null>(null);
  /** L'objectif d'avant le retrait d'un morceau, barré à côté du nouveau ; `null` sinon. */
  readonly previousObjective = input<number | null>(null);
  /** La manche est finie (le bilan) : le libellé dit si elle est débloquée, et le trait passe au vert une fois l'objectif atteint. */
  readonly ended = input(false);

  protected readonly last = computed(() => this.round().round >= this.rounds());
  protected readonly labelKey = computed(() => {
    if (this.ended()) {
      if (!this.reached()) return 'runs.objective.missed';
      return this.last() ? 'runs.objective.goldReached' : 'runs.objective.unlocked';
    }
    return this.last() ? 'runs.objective.gold' : 'runs.objective.unlock';
  });
  protected readonly bar = computed(() => objectiveBar(this.round()));
  /** La part du dernier morceau dans la barre (surlignée), et ce qui était déjà gagné avant lui. */
  protected readonly gainRatio = computed(() => {
    const max = this.round().maxScore;
    const gain = this.gain() ?? 0;
    return max > 0 && gain > 0 ? Math.min(this.bar().scoreRatio, gain / max) : 0;
  });
  protected readonly baseRatio = computed(() => this.bar().scoreRatio - this.gainRatio());
  protected readonly reached = computed(() => objectiveReached(this.round()));
  protected readonly gainText = computed(() => `+${this.gain() ?? 0}`);
}
