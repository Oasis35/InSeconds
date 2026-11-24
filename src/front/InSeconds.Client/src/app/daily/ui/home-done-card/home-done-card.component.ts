import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, inject, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { PointsPipe } from '../../../ui/format/points.pipe';
import { enterHomeCard, fillBarsInTurn } from '../../../ui/motion/motion';
import { ScoreDistributionChartComponent } from '../../../ui/score-distribution-chart/score-distribution-chart.component';
import { ShareButtonComponent } from '../../../gameplay/ui/share-button/share-button.component';
import { TrackResultRow, TrackResultsListComponent } from '../../../gameplay/ui/track-results-list/track-results-list.component';
import { trackBar } from '../result-rows/result-rows';
import { DayHighlightComponent } from '../day-highlight/day-highlight.component';
import { DayHistory, DayStats } from '../../domain/daily';
import { Streak } from '../../domain/streak';
import { StreakPillComponent } from '../streak-pill/streak-pill.component';

/**
 * La carte du défi du jour sur l'accueil une fois joué : « Ton score du jour » et le compte à rebours, la partie en petites barres avec
 * « Détail », qui déplie sur place les morceaux (réponses, écoute, stats) puis l'égaliseur « Les scores du jour » (rien de plus sans les stats,
 * piège 41), la série et les gels à droite de cette ligne, la phrase du moment fort (sinon « mieux que X % »), « Partager mon score ». Tuile du moment (`focus`) tant que
 * rien d'autre n'attend le joueur : tube ambre et « Partager » plein ; quand une autre carte passe devant, une carte simple, « Partager » en contour.
 */
@Component({
  selector: 'app-home-done-card',
  imports: [TranslatePipe, PointsPipe, ShareButtonComponent, DayHighlightComponent, StreakPillComponent, TrackResultsListComponent, ScoreDistributionChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="@container rounded-(--radius-card) p-5 flex flex-col gap-3" data-testid="home-done" [class.tube-amber]="focus()"
      [style.border]="focus() ? null : '1px solid var(--border-medium)'" style="background:var(--bg-surface)">
      <div class="flex items-start justify-between gap-3">
        <div class="min-w-0">
          <h2 class="text-[13px] font-normal" style="font-family:var(--font-body);color:var(--text-muted)">{{ 'daily.result.yourScore' | translate }}</h2>
          <p class="tabular-nums whitespace-nowrap" data-testid="home-score"
            style="font-family:var(--font-score);font-size:clamp(2.4rem, 12vw, 3rem);font-weight:900;line-height:0.95;letter-spacing:-0.02em;color:var(--text-hi)">{{ score() !== null ? (score() ?? 0 | appPoints) : '-' }}</p>
        </div>
        <div class="text-right shrink-0">
          <p class="text-[13px]" style="color:var(--text-muted)">{{ 'daily.result.nextChallenge' | translate }}</p>
          <p class="tabular-nums" data-testid="countdown"
            style="font-family:var(--font-clock);font-size:1.35rem;font-weight:600;line-height:1.1;color:var(--core-cyan);text-shadow:0 0 2px rgb(var(--rgb-accent-2)),0 0 9px rgb(var(--rgb-accent-2) / 0.6)">{{ countdown() }}</p>
        </div>
      </div>
      <!-- La partie en un coup d'œil, comme le texte partagé ; un toucher déplie les morceaux puis les scores du jour dans la carte. À droite, la série et les gels. -->
      <div class="flex items-center justify-between gap-x-3">
        @if (rows().length) {
          <!-- Un déclencheur de dépliage (barres, libellé, chevron), pas un bouton d'action : hors appButton. -->
          <button type="button" (click)="detailOpen.set(!detailOpen())" [attr.aria-expanded]="detailOpen()" data-testid="tracks-toggle"
            class="flex items-center gap-2.5 min-h-11 touch-manipulation">
            <span class="flex gap-1" role="img" [attr.aria-label]="'daily.result.yourTracks' | translate: { count: rows().length }">
              @for (row of rows(); track row.position) {
                <span class="w-4 h-1.5 rounded-full" [style.background]="bar(row)" data-testid="track-bar" data-motion="score-bar"></span>
              }
            </span>
            <span class="flex items-center gap-1 text-sm" style="color:var(--text-light)">
              {{ (detailOpen() ? 'daily.result.hideTracks' : 'daily.result.showTracks') | translate }}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
                class="transition-transform" [class.rotate-180]="detailOpen()"><path d="M6 9l6 6 6-6" /></svg>
            </span>
          </button>
        }
        <app-streak-pill class="ml-auto" [streak]="streak()" [linked]="linked()" [stackWhenNarrow]="true" (open)="openStreak.emit()" />
      </div>
      @if (rows().length && detailOpen()) {
        <div class="-mx-5" style="border-top:1px solid var(--border-medium);border-bottom:1px solid var(--border-medium)" data-testid="home-detail">
          <app-track-results-list [rows]="rows()" [lang]="lang()" />
        </div>
        @if (stats(); as s) {
          <section class="flex flex-col gap-2.5 pt-1" data-testid="home-day-scores">
            <h3 class="text-sm font-semibold" style="font-family:var(--font-body);color:var(--text-hi)">{{ 'daily.result.dayScores' | translate }}</h3>
            <app-score-distribution-chart [stats]="s" [showBetterThan]="false" />
          </section>
        }
      }
      <app-day-highlight [rows]="rows()" [betterThanPercent]="betterThanPercent()" [history]="history()" [yourScore]="score()" />
      @if (score() !== null) {
        <app-share-button class="w-full mt-1" [variant]="focus() ? 'primary' : 'accent'" [copied]="shareCopied()" [failed]="shareFailed()" [disabled]="!canShare()" (share)="share.emit()" />
      }
    </section>
  `,
})
export class HomeDoneCardComponent {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  constructor() {
    afterNextRender(() => {
      enterHomeCard(this.host.nativeElement);
      fillBarsInTurn(Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('[data-motion="score-bar"]')), 0.3);
    });
  }

  readonly score = input.required<number | null>();
  readonly rows = input.required<readonly TrackResultRow[]>();
  readonly countdown = input.required<string>();
  /** Le relevé de série et de gels, sous le partage (rien sans série en cours). */
  readonly streak = input<Streak | null>(null);
  readonly linked = input(false);
  /** « Mieux que X % » quand la partie n'a pas de moment fort ; vide sous 5 joueurs. */
  readonly betterThanPercent = input<number | null>(null);
  /** Ce que l'historique du joueur permet de dire quand les autres joueurs du jour ne suffisent pas. */
  readonly history = input<DayHistory | null>(null);
  /** La carte est la tuile du moment (tube ambre, « Partager » plein) ; faux quand une autre carte passe devant (un seul focus par écran). */
  readonly focus = input(true);
  /** Langue des badges Deezer de la liste des morceaux. */
  readonly lang = input<'fr' | 'en'>('fr');
  /** Les stats du jour, pour l'égaliseur du détail ; sans elles, le détail ne montre que les morceaux. */
  readonly stats = input<DayStats | null>(null);
  readonly canShare = input(true);
  readonly shareCopied = input(false);
  readonly shareFailed = input(false);
  readonly share = output<void>();
  readonly openStreak = output<void>();

  protected readonly detailOpen = signal(false);
  protected readonly bar = trackBar;
}
