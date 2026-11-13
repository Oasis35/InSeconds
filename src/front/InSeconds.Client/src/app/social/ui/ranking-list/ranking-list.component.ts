import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { RankingEntry, avatarOf, badgeColor, initialOf } from '../../domain/group';

/**
 * Le classement d'un groupe : le rang, la pastille et le pseudo de chaque membre, ses points et son disque à droite. La ligne du joueur est en
 * orange (le joueur), celles des autres en violet (les autres joueurs) ; un membre qui n'a encore fini aucune partie ferme la liste, sans rang.
 */
@Component({
  selector: 'app-ranking-list',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="p-1.5" [style.background]="bare() ? null : 'var(--bg-surface)'" [style.border]="bare() ? null : '1px solid var(--border-medium)'"
        [style.border-radius]="bare() ? null : 'var(--radius-card)'" data-testid="ranking-list">
      @for (row of rows(); track $index) {
        <li class="flex items-center gap-3 px-3 py-2.5 min-h-14" data-testid="ranking-row" [attr.data-me]="row.isMe ? 'true' : null"
            [style.border]="row.isMe ? '1px solid var(--color-accent-3)' : '1px solid transparent'"
            [style.border-radius]="'var(--radius-button)'"
            [style.background]="row.isMe ? 'rgb(var(--rgb-accent-3) / 0.1)' : null">
          <span class="w-6 text-sm tabular-nums" [style.color]="row.isMe ? 'var(--color-accent-3)' : 'var(--text-muted)'" data-testid="ranking-rank">{{ row.rank ?? '–' }}</span>
          <span class="flex items-center justify-center w-9 h-9 shrink-0 rounded-full text-sm font-bold" aria-hidden="true"
                [style.background]="row.isMe ? 'var(--color-accent-3)' : 'var(--avatar-' + row.avatar + ')'"
                [style.color]="row.isMe ? 'var(--bg-page)' : 'var(--text-hi)'">{{ row.initial }}</span>
          <span class="flex-1 min-w-0 truncate text-base" [class.font-bold]="row.isMe" [style.color]="row.isMe ? 'var(--color-accent-3)' : 'var(--text-hi)'" data-testid="ranking-pseudo">
            @if (row.isMe) { {{ 'social.ranking.me' | translate }} } @else { {{ row.pseudo }} }
          </span>
          @if (row.points !== null) {
            <span class="text-lg font-bold tabular-nums" style="font-family:var(--font-score)" [style.color]="row.isMe ? 'var(--color-accent-3)' : 'var(--color-violet)'" data-testid="ranking-points">{{ row.points }}</span>
          } @else {
            <span class="text-xs" style="color:var(--text-muted)" data-testid="ranking-unplayed">{{ 'social.ranking.unplayed' | translate }}</span>
          }
          <span class="w-6 h-6 shrink-0 rounded-full flex items-center justify-center" [attr.data-badge]="row.badge" [attr.title]="row.badge ? (row.badge | translate) : null"
                [style.background]="row.color ?? 'transparent'">
            @if (row.color) {
              <span class="w-1.5 h-1.5 rounded-full" style="background:var(--bg-page)" aria-hidden="true"></span>
            }
            @if (row.badge) {
              <!-- Le niveau ne se lit pas qu'à la couleur : son nom pour un lecteur d'écran. -->
              <span class="sr-only">{{ row.badge | translate }}</span>
            }
          </span>
        </li>
      }
    </ol>
  `,
})
export class RankingListComponent {
  readonly entries = input.required<readonly RankingEntry[]>();
  /** La langue des nombres (« 1 380 »). */
  readonly lang = input('fr');
  /** Sans cadre : la liste est posée dans une carte qui en réunit plusieurs. */
  readonly bare = input(false);

  protected readonly rows = computed(() => {
    const numbers = new Intl.NumberFormat(this.lang());
    return this.entries().map(entry => ({
      rank: entry.rank,
      pseudo: entry.pseudo,
      isMe: entry.isMe,
      initial: initialOf(entry.pseudo),
      avatar: avatarOf(entry.pseudo),
      points: entry.points === null ? null : numbers.format(entry.points),
      badge: entry.badge,
      color: badgeColor(entry.badge),
    }));
  });
}
