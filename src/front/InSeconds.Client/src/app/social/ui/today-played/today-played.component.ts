import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { avatarOf, initialOf } from '../../domain/group';
import { TodayScoreEntry } from '../../domain/group-scores';

/**
 * « Aujourd'hui » tant que le joueur n'a pas fini son défi : aucun score, seulement qui a joué (« 2 sur 5 ont joué ») et, par membre, « a joué » ou
 * « pas encore ». Ceux qui ont joué d'abord. Le bouton qui mène au défi est posé par la page, sauf après un abandon sans réponse.
 */
@Component({
  selector: 'app-today-played',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section class="p-4 flex flex-col gap-3" data-testid="today-locked"
             style="background:var(--bg-surface);border:1px solid var(--border-medium);border-radius:var(--radius-card)">
      <p class="text-sm leading-relaxed" style="color:var(--text-light)" data-testid="today-locked-reason">
        {{ (abandoned() ? 'social.scores.lockedAbandoned' : 'social.scores.locked') | translate }}
      </p>
      <p class="text-base font-bold" style="color:var(--text-hi)" data-testid="today-count">
        {{ countKey() | translate: { played: played(), members: members().length } }}
      </p>
      <ul class="flex flex-col">
        @for (member of members(); track $index) {
          <li class="flex items-center gap-3 min-h-12" data-testid="today-member" [attr.data-played]="member.played ? 'true' : null">
            <span class="flex items-center justify-center w-9 h-9 shrink-0 rounded-full text-sm font-bold" aria-hidden="true"
                  [style.opacity]="member.played ? null : '0.45'"
                  [style.background]="member.isMe ? 'var(--color-accent-3)' : 'var(--avatar-' + member.avatar + ')'"
                  [style.color]="member.isMe ? 'var(--bg-page)' : 'var(--text-hi)'">{{ member.initial }}</span>
            <span class="flex-1 min-w-0 truncate text-base" [style.color]="member.isMe ? 'var(--color-accent-3)' : 'var(--text-hi)'">
              @if (member.isMe) { {{ 'social.ranking.me' | translate }} } @else { {{ member.pseudo }} }
            </span>
            <span class="shrink-0 text-xs" data-testid="today-status" [style.color]="member.played ? 'var(--color-violet)' : 'var(--text-muted)'">
              {{ (member.played ? 'social.scores.played' : 'social.scores.notYet') | translate }}
            </span>
          </li>
        }
      </ul>
    </section>
  `,
})
export class TodayPlayedComponent {
  readonly entries = input.required<readonly TodayScoreEntry[]>();
  /** Le joueur a quitté son défi du jour sans répondre : les scores du jour lui restent fermés jusqu'au lendemain (piège 31). */
  readonly abandoned = input(false);

  protected readonly members = computed(() =>
    [...this.entries()]
      .sort((a, b) => Number(b.played) - Number(a.played))
      .map(entry => ({ pseudo: entry.pseudo, isMe: entry.isMe, played: entry.played, initial: initialOf(entry.pseudo), avatar: avatarOf(entry.pseudo) })));

  protected readonly played = computed(() => this.entries().filter(entry => entry.played).length);
  /** « Personne n'a encore joué », « 1 sur 5 a joué », « 2 sur 5 ont joué ». */
  protected readonly countKey = computed(() => {
    const played = this.played();
    if (played === 0) return 'social.scores.playedNone';
    return played === 1 ? 'social.scores.playedCountOne' : 'social.scores.playedCount';
  });
}
