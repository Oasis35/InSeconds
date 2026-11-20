import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { PointsPipe } from '../../../ui/format/points.pipe';
import { LastGroup } from '../../data-access/last-group';
import { SocialApi } from '../../data-access/social.api';
import { provideSocialApi } from '../../data-access/social.providers';
import { Group, avatarOf, initialOf, preferredGroupId } from '../../domain/group';
import { GroupDayScores } from '../../domain/group-scores';

/**
 * « Tes amis ce jour-là », sur la page d'un jour de l'historique (jeton `DAY_FRIENDS_SLOT`) : le classement d'un de ses groupes sur le défi de ce
 * jour, sa ligne en orange, les autres membres en violet, « pas joué » pour qui ne l'a pas fini. Le groupe est celui qu'il a regardé en dernier
 * (`LastGroup`), une pastille par groupe s'il en a plusieurs. Tant qu'il peut encore jouer ce défi, aucun score (le serveur décide). Un invité,
 * un compte sans groupe ou une erreur : rien. Seuls les membres voient les pseudos du groupe.
 */
@Component({
  selector: 'app-day-friends',
  imports: [TranslatePipe, PointsPipe],
  providers: [provideSocialApi()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (scores(); as day) {
      <section class="flex flex-col gap-1.5 px-4 pt-3.5 pb-2" data-testid="day-friends"
               style="background:var(--bg-surface);border:1px solid var(--border-medium);border-radius:var(--radius-card)">
        <h2 class="text-[15px] font-semibold" style="font-family:var(--font-display);color:var(--text-hi)">{{ 'social.dayFriends.title' | translate }}</h2>
        @if (groups().length > 1) {
          <div class="flex flex-wrap gap-2 pt-1" role="group" [attr.aria-label]="'social.dayFriends.groups' | translate">
            @for (group of groups(); track group.id) {
              <button type="button" (click)="select(group.id)" [attr.aria-pressed]="group.id === day.groupId" [attr.data-testid]="'day-friends-group-' + group.id"
                      class="min-h-9 px-3 text-[13px] rounded-(--radius-button) touch-manipulation"
                      [style.border]="group.id === day.groupId ? '1px solid var(--color-accent-3)' : '1px solid var(--border-neutral)'"
                      [style.color]="group.id === day.groupId ? 'var(--text-hi)' : 'var(--text-muted)'">{{ group.name }}</button>
            }
          </div>
        } @else {
          <p class="text-xs" style="color:var(--text-muted)">{{ day.name }}</p>
        }
        @if (day.revealed) {
          <ol class="flex flex-col">
            @for (row of rows(); track row.pseudo; let first = $first) {
              <li class="flex items-center gap-3 min-h-12" [style.border-top]="first ? null : '1px solid var(--border-medium)'" data-testid="day-friends-row">
                <span class="w-5 text-[13px] font-bold tabular-nums" style="font-family:var(--font-score)"
                      [style.color]="row.isMe ? 'var(--color-accent-3)' : 'var(--text-faint)'">{{ row.rank ?? '' }}</span>
                <span aria-hidden="true" class="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-xs font-bold"
                      [style.background]="row.isMe ? 'var(--color-accent-3)' : 'var(--avatar-' + row.avatar + ')'"
                      [style.color]="row.isMe ? 'var(--text-on-orange)' : 'var(--text-hi)'">{{ row.initial }}</span>
                <span class="flex-1 min-w-0 truncate text-sm" [class.font-bold]="row.isMe"
                      [style.color]="row.isMe ? 'var(--color-accent-3)' : 'var(--text-hi)'">{{ row.isMe ? ('social.dayFriends.me' | translate) : row.pseudo }}</span>
                @if (row.score !== null) {
                  <span class="text-[15px] font-bold tabular-nums" style="font-family:var(--font-score)"
                        [style.color]="row.isMe ? 'var(--color-accent-3)' : 'var(--text-hi)'">{{ row.score | appPoints }}</span>
                } @else {
                  <span class="text-[13px]" style="color:var(--text-faint)">{{ 'social.dayFriends.notPlayed' | translate }}</span>
                }
              </li>
            }
          </ol>
        } @else {
          <p class="text-sm py-2" style="color:var(--text-muted)" data-testid="day-friends-hidden">{{ 'social.dayFriends.hidden' | translate }}</p>
        }
      </section>
    }
  `,
})
export class DayFriendsComponent {
  /** Le jour (`aaaa-mm-jj`), posé par l'emplacement de `core`. */
  readonly date = input.required<string>();

  private readonly api = inject(SocialApi);
  private readonly lastGroup = inject(LastGroup);

  protected readonly groups = signal<readonly Group[]>([]);
  private readonly groupId = signal<number | null>(null);
  protected readonly scores = signal<GroupDayScores | null>(null);
  private request = 0;

  protected readonly rows = computed(() =>
    (this.scores()?.entries ?? []).map(entry => ({ ...entry, initial: initialOf(entry.pseudo), avatar: avatarOf(entry.pseudo) })));

  constructor() {
    void this.loadGroups();
    effect(() => {
      const date = this.date();
      const groupId = this.groupId();
      if (groupId !== null) untracked(() => void this.loadScores(groupId, date));
    });
  }

  protected select(groupId: number): void {
    this.groupId.set(groupId);
  }

  private async loadGroups(): Promise<void> {
    try {
      const { groups } = await this.api.myGroups();
      this.groups.set(groups);
      this.groupId.set(preferredGroupId(groups.map(g => g.id), this.lastGroup.get()));
    } catch {
      // Un échec ne montre rien : la page du jour reste entière.
    }
  }

  private async loadScores(groupId: number, date: string): Promise<void> {
    const id = ++this.request;
    try {
      const scores = await this.api.dayScores(groupId, date);
      if (id === this.request) this.scores.set(scores);
    } catch {
      if (id === this.request) this.scores.set(null);
    }
  }
}
