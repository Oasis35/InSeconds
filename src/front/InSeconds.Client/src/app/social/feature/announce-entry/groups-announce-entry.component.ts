import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { SessionStore } from '../../../core/session/session.store';
import { GroupShare } from '../../data-access/group-share';
import { GroupsAnnounce } from '../../data-access/groups-announce';
import { LastGroup } from '../../data-access/last-group';
import { Group, preferredGroupId } from '../../domain/group';
import { announceVariant } from '../../domain/groups-announce';
import { GroupsAnnounceCardComponent } from '../../ui/groups-announce-card/groups-announce-card.component';

/**
 * L'annonce des groupes en tête de l'accueil (`HOME_ANNOUNCE`), chargée à la demande. Un invité la voit tout de suite ; pour un compte, elle attend
 * ses groupes (lus par la carte amis) et garde sa place vide en attendant, pour que le défi ne saute pas. Une lecture en échec : rien. La
 * fermer la remplace par la pastille de la carte amis et le point de l'onglet Groupes (`GroupsAnnounce`).
 */
@Component({
  selector: 'app-groups-announce-entry',
  imports: [GroupsAnnounceCardComponent],
  providers: [GroupShare],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (announce.card() && session.loaded()) {
      @if (variant(); as variant) {
        <div class="pb-3">
          <app-groups-announce-card [variant]="variant" [groupName]="group()?.name ?? ''" [copied]="share.copied()" [failed]="share.failed()"
            (dismiss)="announce.close()" (invite)="inviteFriends()" />
        </div>
      } @else if (announce.groups() === null) {
        <div class="pb-3" aria-hidden="true" data-testid="groups-announce-placeholder">
          <div class="rounded-(--radius-card) min-h-40" style="background:var(--bg-surface);border:1px solid var(--border-medium)"></div>
        </div>
      }
    }
  `,
})
export class GroupsAnnounceEntryComponent {
  protected readonly announce = inject(GroupsAnnounce);
  protected readonly session = inject(SessionStore);
  protected readonly share = inject(GroupShare);
  private readonly lastGroup = inject(LastGroup);

  /** `null` : pas encore (les groupes d'un compte se lisent) ou en échec. */
  protected readonly variant = computed(() => {
    if (!this.session.isLinked()) return announceVariant(false, 0);
    const groups = this.announce.groups();
    return Array.isArray(groups) ? announceVariant(true, groups.length) : null;
  });

  /** Le groupe dont le lien est partagé : le dernier regardé au classement, sinon le premier (comme la carte amis). */
  protected readonly group = computed<Group | null>(() => {
    const groups = this.announce.groups();
    if (!Array.isArray(groups)) return null;
    const id = preferredGroupId(groups.map(group => group.id), this.lastGroup.get());
    return groups.find(group => group.id === id) ?? null;
  });

  protected inviteFriends(): void {
    const group = this.group();
    if (group) void this.share.invite(group);
  }
}
