import { ChangeDetectionStrategy, Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { LanguageService } from '../../../core/i18n/language.service';
import { formatOrdinal } from '../../../ui/format/ordinal';
import { GroupsStore } from '../../data-access/groups.store';
import { PendingInvite } from '../../data-access/pending-invite';

/**
 * Les groupes du joueur à la fin d'une partie, dans un bloc violet (la couleur des autres joueurs) titré « Tes groupes » : une ligne par groupe avec
 * sa place (« Potes · n° 2 sur 5 ») et, s'il vient de monter, « Tu passes devant Léa », ou « Joue avec tes amis · Créer un groupe » s'il n'en a pas ; au-dessus, l'invitation reçue avec le lien de la playlist (« Rejoindre le groupe »), pour tout joueur. Les places
 * ne se lisent que pour qui a des groupes (`showGroups`) : le store est celui de la page.
 */
@Component({
  selector: 'app-groups-strip',
  imports: [TranslatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (pendingCode() || showGroups()) {
      <section class="flex flex-col gap-2.5 px-4 py-3 text-sm" data-testid="groups-strip"
        style="background:rgb(var(--rgb-violet) / 0.12);border:1px solid rgb(var(--rgb-violet) / 0.6);border-radius:var(--radius-card)">
        <h3 class="text-xs font-bold uppercase tracking-widest" style="font-family:var(--font-body);color:var(--color-violet)">{{ 'social.strip.title' | translate }}</h3>
        @if (pendingCode(); as code) {
          <a [routerLink]="['/ranking/join', code]" class="flex items-center justify-between gap-3 min-h-11" data-testid="strip-pending" style="color:var(--text-hi)">
            <span>{{ 'social.pending.line' | translate }}</span><span aria-hidden="true">›</span>
          </a>
        }
        @if (showGroups()) {
          @if (store.standings(); as standings) {
            @for (standing of standings; track standing.groupId) {
              @if (!$first || pendingCode()) { <div class="h-px" style="background:rgb(var(--rgb-violet) / 0.3)"></div> }
              <a [routerLink]="['/ranking']" [queryParams]="{ group: standing.groupId }" class="flex items-center justify-between gap-3 min-h-11" data-testid="strip-group" style="color:var(--text-hi)">
                <span class="min-w-0">
                  <span class="block truncate font-bold text-base">{{ standing.name }}</span>
                  @if (standing.moved; as moved) {
                    <span class="block text-xs break-words" data-testid="strip-moved" style="color:var(--text-light)">{{ 'social.strip.passed' | translate: { name: moved.passed } }}</span>
                  }
                </span>
                <span class="shrink-0 tabular-nums flex items-baseline gap-1.5" style="color:var(--color-accent-3)">
                  @if (standing.rank !== null) {
                    <b class="text-xl" data-testid="strip-rank">{{ ordinal(standing.rank) }}</b>
                    @if (standing.moved; as moved) {
                      <span class="text-sm font-bold" data-testid="strip-up" style="color:var(--color-success)"><span aria-hidden="true">↑</span> {{ moved.from - standing.rank }}</span>
                    } @else if (stable()) {
                      <span class="text-sm" aria-hidden="true" style="color:var(--text-muted)">=</span>
                    }
                  }
                </span>
              </a>
            } @empty {
              @if (!pendingCode()) {
                <a routerLink="/ranking/new" class="flex items-center justify-between gap-3 min-h-11" data-testid="strip-create" style="color:var(--text-hi)">
                  <span>{{ 'social.strip.empty' | translate }}</span>
                  <span class="shrink-0" style="color:var(--color-accent-3)">{{ 'social.strip.create' | translate }} <span aria-hidden="true">›</span></span>
                </a>
              }
            }
          }
        }
      </section>
    }
  `,
})
export class GroupsStripComponent implements OnInit {
  /** Le joueur a-t-il des groupes à montrer (un compte, sous l'interface V4) ? */
  readonly showGroups = input(false);
  /** Les points que sa partie vient d'ajouter à son niveau : de quoi dire qu'il a dépassé quelqu'un (« Tu passes devant Léa »). */
  readonly levelDelta = input<number | null>(null);

  protected readonly store = inject(GroupsStore);
  private readonly language = inject(LanguageService);
  /** Sa partie n'a pas fait baisser sa place (elle a ajouté des points ou rien) : « = » quand il n'a dépassé personne. */
  protected readonly stable = computed(() => (this.levelDelta() ?? -1) >= 0);
  protected readonly pendingCode = signal(inject(PendingInvite).get());

  protected ordinal(rank: number): string {
    return formatOrdinal(rank, this.language.current() === 'en' ? 'en' : 'fr');
  }

  ngOnInit(): void {
    if (this.showGroups()) void this.store.loadStandings(this.levelDelta());
  }
}
