import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TrackResultRow, TrackResultsListComponent } from '../../../gameplay/ui/track-results-list/track-results-list.component';
import { RunRound, RunRoundSummary } from '../../domain/run';
import { RunObjectiveComponent } from '../run-objective/run-objective.component';
import { ButtonComponent } from '../../../ui/button/button.component';

/**
 * Le bilan d'une manche : « MANCHE 2 / 4 », « Manche 2 terminée » (✓ si elle est débloquée, ✕ sinon), le bloc objectif, les morceaux joués dans
 * les lignes de l'écran « déjà joué » du Daily (sans graphique), le score total, puis « Manche suivante » (ou, si la partie s'arrête là, le
 * bouton qui mène à la fin). Un morceau retiré de la manche n'a rien à montrer : une ligne dit combien il y en a.
 */
@Component({
  selector: 'app-run-round-summary',
  imports: [TranslatePipe, TrackResultsListComponent, RunObjectiveComponent, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex-1 flex flex-col' },
  template: `
    <div class="screen-enter flex-1 flex flex-col gap-4 pt-2" data-testid="run-round-end">
      <p class="text-sm font-extrabold uppercase tracking-wide text-center pt-1" style="font-family:var(--font-display);color:var(--text-hi)">
        {{ 'runs.header.round' | translate: { round: summary().round, rounds: rounds() } }}
      </p>
      <div class="flex flex-col items-center gap-3">
        <span class="w-16 h-16 rounded-full flex items-center justify-center" data-testid="run-round-end-icon" [attr.data-passed]="passed()"
          [style.background]="passed() ? 'rgb(var(--rgb-success) / 0.14)' : 'rgb(var(--rgb-danger) / 0.14)'"
          [style.color]="passed() ? 'var(--color-success)' : 'var(--color-fail)'">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            @if (passed()) {
              <polyline points="5 12.5 10 17.5 19 7" />
            } @else {
              <line x1="6" y1="6" x2="18" y2="18" /><line x1="18" y1="6" x2="6" y2="18" />
            }
          </svg>
        </span>
        <h2 class="text-2xl font-bold" style="font-family:var(--font-display);color:var(--text-hi)" data-testid="run-round-end-title">
          {{ 'runs.roundEnd.title' | translate: { round: summary().round } }}
        </h2>
      </div>

      <app-run-objective [round]="round()" [rounds]="rounds()" [ended]="true" />

      @if (rows().length > 0) {
        <section class="rounded-(--radius-card) overflow-hidden" style="background:rgb(var(--rgb-surface) / 0.55);border:1px solid var(--border-subtle)"
          data-testid="run-round-tracks">
          <app-track-results-list [rows]="rows()" [lang]="lang()" />
        </section>
      }
      @if (withdrawnCount() > 0) {
        <p class="text-xs text-center" style="color:var(--text-faint)" data-testid="run-round-withdrawn">
          {{ (withdrawnCount() > 1 ? 'runs.roundEnd.withdrawnMany' : 'runs.roundEnd.withdrawnOne') | translate: { count: withdrawnCount() } }}
        </p>
      }

      <div class="flex items-baseline justify-between px-1 pt-1">
        <span class="text-sm" style="color:var(--text-muted)">{{ 'runs.roundEnd.total' | translate }}</span>
        <span class="text-3xl font-extrabold tabular-nums" style="font-family:var(--font-display);color:var(--color-accent-3)" data-testid="run-round-total">
          {{ summary().totalScore }}
        </span>
      </div>

      <button appButton type="button" [block]="true" [glow]="true" (click)="next.emit()" data-testid="run-next-round">
        {{ (endsRun() ? 'runs.roundEnd.seeResult' : 'runs.roundEnd.next') | translate }}
      </button>
    </div>
  `,
})
export class RunRoundSummaryComponent {
  readonly summary = input.required<RunRoundSummary>();
  /** La manche telle que le bloc objectif la dessine (le maximum de points en plus du bilan). */
  readonly round = input.required<RunRound>();
  readonly rounds = input.required<number>();
  /** La partie s'arrête après ce bilan (manche ratée, ou dernière manche) : le bouton mène à la fin. */
  readonly endsRun = input(false);
  readonly lang = input<'fr' | 'en'>('fr');
  /** « Manche suivante » ou « Voir le résultat » : la page lance le son suivant dans ce clic. */
  readonly next = output();

  protected readonly passed = computed(() => this.summary().passed);
  protected readonly withdrawnCount = computed(() => this.summary().tracks.filter(t => t.neutralized).length);
  protected readonly rows = computed<TrackResultRow[]>(() =>
    this.summary().tracks
      .filter(t => !t.neutralized)
      .map(t => ({
        position: t.position,
        artist: t.artist ?? '',
        title: t.title ?? '',
        coverUrl: t.coverUrl,
        artistCorrect: t.artistCorrect,
        titleCorrect: t.titleCorrect,
        listenedSeconds: null,
        averageSecondsWhenCorrect: null,
        score: t.points,
        deezerTrackId: t.deezerTrackId ?? 0,
        distribution: [],
        notFoundCount: 0,
      })));
}
