import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { ChallengeStats, ChallengeTrackStats, unfinishedCount } from '../domain/challenge';
import { ChallengePlayerChipsComponent } from './challenge-player-chips.component';
import { ChallengeTrackStatsComponent } from './challenge-track-stats.component';

/**
 * Un défi dans « Stats par défi » : en-tête cliquable (date, joueurs, abandons, médiane), un chip par
 * joueur, puis, déplié, les scores, le recalcul des chiffres figés et les taux de chaque morceau.
 * Purement présentationnel.
 */
@Component({
  selector: 'app-challenge-card',
  imports: [DatePipe, TranslatePipe, ChallengePlayerChipsComponent, ChallengeTrackStatsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let c = challenge();
    <div class="py-3" style="border-top:1px solid var(--border-medium)">
      <button type="button" (click)="toggled.emit()" [attr.aria-expanded]="expanded()"
        class="w-full flex items-center justify-between gap-2 text-left">
        <div class="flex items-center gap-3">
          <span class="font-mono text-sm" style="color:var(--text-hi)">{{ c.date }}</span>
          <span class="text-xs px-2 py-0.5 rounded-full" style="color:var(--text-muted);background:var(--bg-inactive)">
            {{ c.playerCount }} {{ (c.playerCount > 1 ? 'admin.dashboard.players' : 'admin.dashboard.player') | translate }}
          </span>
          @if (unfinished() > 0) {
            <span class="text-xs px-2 py-0.5 rounded-full" style="color:var(--bg-warn);background:rgba(251,191,36,0.1)">
              {{ unfinished() }} {{ (unfinished() > 1 ? 'admin.dashboard.abandons' : 'admin.dashboard.abandon') | translate }}
            </span>
          }
        </div>
        <div class="flex items-center gap-4 text-xs" style="color:var(--text-muted)">
          @if (c.scoreMedian !== null) {
            <span>{{ 'admin.dashboard.median' | translate }} <span class="font-medium" style="color:var(--text-hi)">{{ c.scoreMedian }}</span></span>
          }
          <span style="color:var(--text-sep)" aria-hidden="true">{{ expanded() ? '▲' : '▼' }}</span>
        </div>
      </button>

      @if (c.players.length > 0) {
        <app-challenge-player-chips
          [players]="c.players" [youId]="youId()" [highlightedId]="highlightedId()" [copiedId]="copiedId()"
          (playerSelected)="selectPlayer.emit($event)" (playerCopied)="copyPlayer.emit($event)" />
      }

      @if (expanded()) {
        <div class="mt-3 flex flex-col gap-2">
          @if (c.scoreMin !== null && c.scoreMax !== null) {
            <div class="flex gap-4 text-xs" style="color:var(--text-muted)">
              <span>{{ 'admin.dashboard.min' | translate }} <span class="font-medium" style="color:var(--text-light)">{{ c.scoreMin }}</span></span>
              <span>{{ 'admin.dashboard.avg' | translate }} <span class="font-medium" style="color:var(--text-light)">{{ c.scoreAvg }}</span></span>
              <span>{{ 'admin.dashboard.max' | translate }} <span class="font-medium" style="color:var(--text-light)">{{ c.scoreMax }}</span></span>
            </div>
          }

          @if (c.computedAt || c.canRecompute) {
            <div class="flex flex-wrap items-center gap-3 text-xs" style="color:var(--text-muted)">
              @if (c.computedAt; as at) {
                <span data-testid="challenge-computed-at">
                  {{ 'admin.challenges.computedAt' | translate: { date: (at | date: 'dd/MM/yyyy HH:mm') } }}
                </span>
              }
              @if (c.canRecompute) {
                <button type="button" (click)="recompute.emit(c.date)" [disabled]="recomputing()"
                  class="px-2.5 py-1 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style="background:var(--bg-inactive);color:var(--text-hi)">
                  {{ (recomputing() ? 'admin.challenges.recomputing' : 'admin.challenges.recompute') | translate }}
                </button>
              }
            </div>
            @if (recomputeErrorKey(); as key) {
              <p role="alert" class="text-xs" style="color:var(--text-error)">{{ key | translate }}</p>
            }
          }

          @for (t of c.tracks; track t.position) {
            <app-challenge-track-stats [track]="t" (showChart)="showChart.emit($event)" />
          }
        </div>
      }
    </div>
  `,
})
export class ChallengeCardComponent {
  readonly challenge = input.required<ChallengeStats>();
  readonly expanded = input(false);
  /** L'identifiant du joueur de ce navigateur, s'il y en a un. */
  readonly youId = input<string | null>(null);
  readonly highlightedId = input<string | null>(null);
  readonly copiedId = input<string | null>(null);
  /** Le recalcul des stats de ce défi est en cours. */
  readonly recomputing = input(false);
  /** Clé i18n de l'erreur du dernier recalcul, s'il a échoué. */
  readonly recomputeErrorKey = input<string | null>(null);

  readonly toggled = output<void>();
  readonly selectPlayer = output<string>();
  readonly copyPlayer = output<string>();
  readonly showChart = output<ChallengeTrackStats>();
  /** Demande le recalcul des stats de ce jour (`aaaa-mm-jj`). */
  readonly recompute = output<string>();

  protected readonly unfinished = computed(() => unfinishedCount(this.challenge()));
}
