import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { SecondsPipe } from '../../../ui/format/seconds.pipe';
import { DayHistory } from '../../domain/daily';
import { Highlight, HistoryHighlight, highlightOf, historyHighlightOf } from '../../domain/highlight';
import { PointsPipe } from '../../../ui/format/points.pipe';
import { TrackResultRow } from '../../../gameplay/ui/track-results-list/track-results-list.component';

/**
 * La phrase du résultat du jour : le moment fort de la partie quand il y en a un, sinon « Tu fais mieux que X % des joueurs », Puis, faute de mieux, une phrase tirée de
 * l'historique du joueur (record, vitesse, moyenne). Rien sinon. Partagée par l'écran du résultat et la carte du défi fait de l'accueil V4.
 */
@Component({
  selector: 'app-day-highlight',
  imports: [TranslatePipe, SecondsPipe, PointsPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (highlight(); as h) {
      <p class="text-sm leading-relaxed" style="color:var(--text-light)" data-testid="day-highlight">
        @if (h.kind === 'fast') {
          <b style="color:var(--text-hi)">{{ h.artist }}</b> {{ 'daily.result.fastIn' | translate }}
          <span style="color:var(--color-accent-2)">{{ h.seconds | appSeconds }}</span>{{ 'daily.result.fastAfter' | translate: { percent: h.percent } }}
        } @else {
          {{ 'daily.result.rareBefore' | translate }} <b style="color:var(--text-hi)">{{ h.artist }}</b>{{ 'daily.result.rareAfter' | translate: { percent: h.percent } }}
        }
      </p>
    } @else if (betterThanPercent() !== null) {
      <p class="text-sm leading-relaxed" style="color:var(--text-light)" data-testid="score-better-than">
        {{ 'daily.scoreChart.betterThanPrefix' | translate }}
        <b style="color:var(--color-accent-3)">{{ betterThanPercent() }} %</b>
        {{ 'daily.scoreChart.betterThanSuffix' | translate }}
      </p>
    } @else if (past(); as p) {
      <p class="text-sm leading-relaxed" style="color:var(--text-light)" data-testid="day-history">
        @switch (p.kind) {
          @case ('record') {
            {{ 'daily.result.historyRecord' | translate: { previous: (p.previousBest | appPoints) } }}
          }
          @case ('speed') {
            {{ 'daily.result.historySpeedBefore' | translate }}
            <span style="color:var(--color-accent-2)">{{ p.seconds | appSeconds }}</span>{{ 'daily.result.historySpeedAfter' | translate: { percent: p.percent } }}
          }
          @case ('average') {
            {{ 'daily.result.historyAverage' | translate: { average: (p.average | appPoints) } }}
          }
        }
      </p>
    }
  `,
})
export class DayHighlightComponent {
  readonly rows = input.required<readonly TrackResultRow[]>();
  /** « Mieux que X % » : le serveur le laisse vide sous 5 joueurs. */
  readonly betterThanPercent = input<number | null>(null);

  /** L'historique du joueur : seulement quand il a fini sa partie du jour. */
  readonly history = input<DayHistory | null>(null);
  readonly yourScore = input<number | null>(null);

  protected readonly highlight = computed<Highlight | null>(() =>
    highlightOf(this.rows()
      .filter(r => r.listenedSeconds !== null)
      .map(r => ({
        position: r.position,
        artist: r.artist,
        found: r.artistCorrect === true || r.titleCorrect === true,
        listenedSeconds: r.listenedSeconds!,
        distribution: r.distribution,
        notFoundCount: r.notFoundCount,
      }))));

  /** Dernier recours, quand les autres joueurs du jour ne permettent aucune comparaison. */
  protected readonly past = computed<HistoryHighlight | null>(() => historyHighlightOf(this.history(), this.yourScore()));
}
