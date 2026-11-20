import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { PointsPipe } from '../../../ui/format/points.pipe';
import { SecondsPipe } from '../../../ui/format/seconds.pipe';
import { formatPoints } from '../../../ui/format/format-points';
import { DayHistory } from '../../domain/daily';

/** Ce que la partie du jour dit du joueur : sa première partie, un record, son meilleur depuis N jours, ou rien de marquant. */
export type GameProfileLine =
  | { readonly kind: 'first' }
  | { readonly kind: 'record'; readonly above: number }
  | { readonly kind: 'bestSince'; readonly days: number }
  | { readonly kind: 'average'; readonly diff: number };

export function gameProfileLine(history: DayHistory, score: number): GameProfileLine {
  if (history.previousGames === 0) return { kind: 'first' };
  if (history.bestSinceDays === null && history.previousBestScore !== null && score > history.previousBestScore) {
    return { kind: 'record', above: score - history.previousBestScore };
  }
  if (history.bestSinceDays !== null && history.bestSinceDays > 1) return { kind: 'bestSince', days: history.bestSinceDays };
  return { kind: 'average', diff: score - (history.previousAverageScore ?? score) };
}

/**
 * La carte « Ton profil d'oreille » de la fin du défi : ce que la partie change (première partie, record, meilleur score depuis N jours, ou l'écart
 * à sa moyenne), puis sa moyenne après la partie et ses trouvés au premier palier, avec ce que la partie y ajoute. Toute la carte mène au profil.
 * Jamais la tuile de focus (le partage l'est).
 */
@Component({
  selector: 'app-game-profile-card',
  imports: [RouterLink, TranslatePipe, PointsPipe, SecondsPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a routerLink="/history/daily/profil" class="flex flex-col gap-3 p-4 touch-manipulation" data-testid="game-profile-card"
       style="background:var(--bg-surface);border:1px solid var(--border-medium);border-radius:var(--radius-card)">
      <span class="flex items-center justify-between">
        <span class="text-base font-semibold" style="font-family:var(--font-display);color:var(--text-hi)">{{ 'daily.profile.title' | translate }}</span>
        <span class="text-[13px]" style="color:var(--text-light)">{{ 'daily.profile.seeAll' | translate }} <span aria-hidden="true">›</span></span>
      </span>
      <span class="text-sm" style="color:var(--text-light)" data-testid="game-profile-line">{{ lineKey() | translate: lineParams() }}</span>
      @if (history().previousGames > 0) {
        <span class="grid grid-cols-2 gap-2.5 pt-3" style="border-top:1px solid var(--border-medium)">
          <span class="flex flex-col gap-0.5">
            <span class="text-[11px]" style="color:var(--text-muted)">{{ 'daily.profile.yourAverage' | translate }}</span>
            <span class="text-lg font-bold tabular-nums" style="font-family:var(--font-score);color:var(--text-hi)" data-testid="game-profile-average">
              {{ history().averageScoreAfter | appPoints }}
              @if (averageDelta() !== 0) {
                <span class="text-xs" style="color:var(--color-accent-3)">{{ averageDelta() > 0 ? '+' : '' }}{{ averageDelta() | appPoints }}</span>
              }
            </span>
          </span>
          <span class="flex flex-col gap-0.5">
            <span class="text-[11px]" style="color:var(--text-muted)">{{ 'daily.profile.foundAt' | translate: { seconds: (history().firstStepSeconds | appSeconds) } }}</span>
            <span class="text-lg font-bold tabular-nums" style="font-family:var(--font-score);color:var(--text-hi)" data-testid="game-profile-first-step">
              {{ history().firstStepFoundTotal }}
              @if (history().firstStepFoundToday > 0) {
                <span class="text-xs" style="color:var(--color-accent-3)">{{ 'daily.profile.today' | translate: { count: history().firstStepFoundToday } }}</span>
              }
            </span>
          </span>
        </span>
      }
    </a>
  `,
})
export class GameProfileCardComponent {
  readonly history = input.required<DayHistory>();
  readonly score = input.required<number>();
  readonly lang = input<'fr' | 'en'>('fr');

  private readonly line = computed(() => gameProfileLine(this.history(), this.score()));

  protected readonly lineKey = computed(() => {
    const line = this.line();
    if (line.kind === 'average') return line.diff >= 0 ? 'daily.profile.line.above' : 'daily.profile.line.below';
    return `daily.profile.line.${line.kind}`;
  });

  protected readonly lineParams = computed(() => {
    const line = this.line();
    switch (line.kind) {
      case 'record': return { points: formatPoints(line.above, this.lang()) };
      case 'bestSince': return { days: line.days };
      case 'average': return { points: formatPoints(Math.abs(line.diff), this.lang()) };
      default: return {};
    }
  });

  protected readonly averageDelta = computed(() => this.history().averageScoreAfter - (this.history().previousAverageScore ?? this.history().averageScoreAfter));
}
