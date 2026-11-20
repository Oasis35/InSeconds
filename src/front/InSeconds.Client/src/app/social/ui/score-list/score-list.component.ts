import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { avatarOf, initialOf } from '../../domain/group';
import { ScoreRow } from '../../domain/group-scores';

/**
 * Le classement d'un groupe au Défi du jour : le rang, la pastille et le pseudo de chaque membre, ses points (la semaine) ou son score (le jour)
 * à droite et, pour la semaine, un point par jour sous le pseudo, allumé les jours joués (le plus ancien à gauche, le jour en cours à droite). La
 * ligne du joueur est en orange (le joueur), celles des autres en violet (les autres joueurs) ; un membre sans partie ferme la liste, sans rang.
 */
@Component({
  selector: 'app-score-list',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="p-1.5" style="background:var(--bg-surface);border:1px solid var(--border-medium);border-radius:var(--radius-card)" data-testid="score-list">
      @for (row of view(); track $index) {
        <li class="flex items-center gap-3 px-3 py-2.5 min-h-14" data-testid="score-row" [attr.data-me]="row.isMe ? 'true' : null"
            [style.border]="row.isMe ? '1px solid var(--color-accent-3)' : '1px solid transparent'"
            [style.border-radius]="'var(--radius-button)'"
            [style.background]="row.isMe ? 'rgb(var(--rgb-accent-3) / 0.1)' : null">
          <span class="w-6 shrink-0 text-sm tabular-nums" [style.color]="row.isMe ? 'var(--color-accent-3)' : 'var(--text-muted)'" data-testid="score-rank">{{ row.rank ?? '–' }}</span>
          <span class="flex items-center justify-center w-9 h-9 shrink-0 rounded-full text-sm font-bold" aria-hidden="true"
                [style.background]="row.isMe ? 'var(--color-accent-3)' : 'var(--avatar-' + row.avatar + ')'"
                [style.color]="row.isMe ? 'var(--bg-page)' : 'var(--text-hi)'">{{ row.initial }}</span>
          <span class="flex-1 min-w-0 flex flex-col gap-1">
            <span class="truncate text-base" [class.font-bold]="row.isMe" [style.color]="row.isMe ? 'var(--color-accent-3)' : 'var(--text-hi)'" data-testid="score-pseudo">
              @if (row.isMe) { {{ 'social.ranking.me' | translate }} } @else { {{ row.pseudo }} }
            </span>
            @if (row.days; as days) {
              <span class="flex items-center gap-1" role="img" data-testid="score-days" [attr.data-played]="row.played"
                    [attr.aria-label]="(row.played === 1 ? 'social.scores.daysPlayedOne' : 'social.scores.daysPlayed') | translate: { count: row.played, total: days.length }">
                @for (played of days; track $index) {
                  <span class="w-1.5 h-1.5 shrink-0 rounded-full" aria-hidden="true" data-testid="score-day" [attr.data-on]="played ? 'true' : null"
                        [style.background]="played ? (row.isMe ? 'var(--color-accent-3)' : 'var(--color-violet)') : 'transparent'"
                        [style.border]="played ? null : '1px solid var(--border-neutral)'"></span>
                }
              </span>
            }
          </span>
          @if (row.value !== null) {
            <span class="shrink-0 text-lg font-bold tabular-nums" style="font-family:var(--font-score)" [style.color]="row.isMe ? 'var(--color-accent-3)' : 'var(--color-violet)'" data-testid="score-value">{{ row.value }}</span>
          } @else {
            <span class="shrink-0 text-xs" style="color:var(--text-muted)" data-testid="score-unplayed">{{ unplayedKey() | translate }}</span>
          }
        </li>
      }
    </ol>
  `,
})
export class ScoreListComponent {
  readonly rows = input.required<readonly ScoreRow[]>();
  /** La langue des nombres (« 1 380 »). */
  readonly lang = input('fr');
  /** Ce qui remplace la valeur d'un membre qui n'a pas joué (sur la semaine, ou aujourd'hui). */
  readonly unplayedKey = input('social.ranking.unplayed');

  protected readonly view = computed(() => {
    const numbers = new Intl.NumberFormat(this.lang());
    return this.rows().map(row => ({
      ...row,
      initial: initialOf(row.pseudo),
      avatar: avatarOf(row.pseudo),
      value: row.value === null ? null : numbers.format(row.value),
      played: row.days?.filter(Boolean).length ?? 0,
    }));
  });
}
