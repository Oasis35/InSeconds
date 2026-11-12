import { ChangeDetectionStrategy, Component, OnInit, inject, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { GroupsStore } from '../../data-access/groups.store';
import { PendingInvite } from '../../data-access/pending-invite';

/**
 * Les groupes du joueur à la fin d'une partie : une ligne par groupe avec sa place (« Potes · 2e sur 5 »), ou « Joue avec tes amis · Créer un
 * groupe » s'il n'en a pas ; au-dessus, l'invitation reçue avec le lien de la playlist (« Rejoindre le groupe »), pour tout joueur. Les places
 * ne se lisent que pour qui a des groupes (`showGroups`) : le store est celui de la page.
 */
@Component({
  selector: 'app-groups-strip',
  imports: [TranslatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (pendingCode() || showGroups()) {
      <div class="flex flex-col gap-2 text-sm" data-testid="groups-strip">
        @if (pendingCode(); as code) {
          <a [routerLink]="['/ranking/join', code]" class="flex items-center justify-between gap-3 px-4 py-3 min-h-11" data-testid="strip-pending"
             style="border:1px solid var(--color-accent-3);border-radius:var(--radius-button);color:var(--text-hi)">
            <span>{{ 'social.pending.line' | translate }}</span><span aria-hidden="true">›</span>
          </a>
        }
        @if (showGroups()) {
          @if (store.standings(); as standings) {
            @for (standing of standings; track standing.groupId) {
              <a [routerLink]="['/ranking']" [queryParams]="{ group: standing.groupId }" class="flex items-center justify-between gap-3 px-4 py-3 min-h-11" data-testid="strip-group"
                 style="border:1px solid var(--border-neutral);border-radius:var(--radius-button);color:var(--text-hi)">
                <span class="min-w-0 truncate">{{ standing.name }}</span>
                <span class="shrink-0 tabular-nums" style="color:var(--color-accent-3)">
                  @if (standing.rank !== null) { {{ 'social.strip.rank' | translate: { rank: standing.rank, members: standing.members } }} }
                  <span aria-hidden="true" style="color:var(--text-muted)"> ›</span>
                </span>
              </a>
            } @empty {
              @if (!pendingCode()) {
                <a routerLink="/ranking/new" class="flex items-center justify-between gap-3 px-4 py-3 min-h-11" data-testid="strip-create"
                   style="border:1px solid var(--border-neutral);border-radius:var(--radius-button);color:var(--text-hi)">
                  <span>{{ 'social.strip.empty' | translate }}</span>
                  <span class="shrink-0" style="color:var(--color-accent-3)">{{ 'social.strip.create' | translate }} <span aria-hidden="true">›</span></span>
                </a>
              }
            }
          }
        }
      </div>
    }
  `,
})
export class GroupsStripComponent implements OnInit {
  /** Le joueur a-t-il des groupes à montrer (un compte, sous l'interface V4) ? */
  readonly showGroups = input(false);

  protected readonly store = inject(GroupsStore);
  protected readonly pendingCode = signal(inject(PendingInvite).get());

  ngOnInit(): void {
    if (this.showGroups()) void this.store.loadStandings();
  }
}
