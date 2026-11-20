import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { LanguageService } from '../../../core/i18n/language.service';
import { SessionStore } from '../../../core/session/session.store';
import { ShellChromeStore } from '../../../core/shell/shell-chrome.store';
import { GroupShare } from '../../data-access/group-share';
import { LastGroup } from '../../data-access/last-group';
import { SocialApi } from '../../data-access/social.api';
import { provideSocialApi } from '../../data-access/social.providers';
import { FriendsCardView, groupCardView } from '../../domain/friends-card';
import { Group, preferredGroupId } from '../../domain/group';
import { FriendsHomeCardComponent } from '../../ui/friends-home-card/friends-home-card.component';

/**
 * L'entrée des groupes sur l'accueil, chargée à la demande, pour tout le monde : un invité y lit qu'un groupe exige un compte, un compte sans groupe
 * qu'il peut en créer un, un membre voit son groupe (le dernier regardé, au classement ou ici, sinon le premier) et, dans plusieurs groupes, une
 * pastille chacun pour en changer (`select`, les scores du seul groupe choisi). Les scores du jour n'arrivent qu'une fois
 * son propre défi fini : c'est le serveur qui le décide (`todayRevealed`), la carte se relit quand le défi du jour se termine. Une erreur ne montre
 * rien : la carte est un plus, jamais une panne de l'accueil.
 */
@Component({
  selector: 'app-social-home-entry',
  imports: [FriendsHomeCardComponent],
  providers: [provideSocialApi(), GroupShare],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (view(); as view) {
      <div class="pt-3">
        <app-friends-home-card [view]="view" [lang]="lang()" [showLogin]="!chrome.accountCtaShown()" [groups]="groups()" [canCreate]="canCreate()" [inviteState]="inviteState()"
          (groupSelected)="select($event)" (invite)="invite($event)" />
      </div>
    } @else if (reserving()) {
      <!-- La place de la carte pendant sa lecture : la carte Survie, souvent prête avant, ne saute pas quand celle-ci arrive au-dessus. -->
      <div class="pt-3" aria-hidden="true" data-testid="friends-card-placeholder">
        <div class="rounded-(--radius-card) min-h-36" style="background:var(--bg-surface);border:1px solid var(--border-medium)"></div>
      </div>
    }
  `,
})
export class SocialHomeEntryComponent {
  private readonly session = inject(SessionStore);
  protected readonly chrome = inject(ShellChromeStore);
  private readonly api = inject(SocialApi);
  private readonly lastGroup = inject(LastGroup);
  private readonly language = inject(LanguageService);
  private readonly share = inject(GroupShare);
  protected readonly inviteState = computed<'idle' | 'copied' | 'failed'>(() => (this.share.copied() ? 'copied' : this.share.failed() ? 'failed' : 'idle'));

  protected readonly view = signal<FriendsCardView | null>(null);
  /** Les groupes du joueur : dès qu'il y en a plusieurs, la carte offre une pastille chacun. */
  protected readonly groups = signal<readonly Group[]>([]);
  private readonly maxGroups = signal(0);
  /** Sous le maximum de groupes (`Social:MaxGroupsPerPlayer`, rendu par le serveur) : « Créer un nouveau groupe » reste offert. */
  protected readonly canCreate = computed(() => this.groups().length > 0 && this.groups().length < this.maxGroups());
  /** La carte d'un compte se lit (deux appels) : sa place est gardée, vide, tant qu'elle n'est pas là. */
  protected readonly reserving = signal(false);
  protected readonly lang = computed<'fr' | 'en'>(() => (this.language.current() === 'en' ? 'en' : 'fr'));
  private latest = 0;

  constructor() {
    effect(() => {
      // L'identité se lit au démarrage de l'app : avant, « pas de compte » ne veut encore rien dire.
      if (!this.session.loaded()) return;
      const linked = this.session.isLinked();
      // Le défi du jour qui se termine relit la carte : les scores du jour arrivent.
      this.chrome.dailyDone();
      untracked(() => void this.load(linked));
    });
  }

  private async load(linked: boolean): Promise<void> {
    const request = ++this.latest;
    if (!linked) {
      this.view.set({ kind: 'guest' });
      return;
    }
    let view: FriendsCardView | null;
    let mine: readonly Group[] = [];
    let max = 0;
    if (this.view() === null) this.reserving.set(true);
    try {
      const mygroups = await this.api.myGroups();
      mine = mygroups.groups;
      max = mygroups.maxGroups;
      const groupId = preferredGroupId(mine.map(group => group.id), this.lastGroup.get());
      view = groupId === null ? { kind: 'no_group' } : groupCardView(await this.api.scores(groupId));
    } catch {
      view = null;
    }
    if (request !== this.latest) return;
    this.groups.set(mine);
    this.maxGroups.set(max);
    this.view.set(view);
    this.reserving.set(false);
  }

  /** « Inviter un ami » : le lien du groupe en cours, par le partage du téléphone ou la copie. Lancé dans le clic, sans `await` avant. */
  protected invite(groupId: number): void {
    const group = this.groups().find(candidate => candidate.id === groupId);
    if (group) void this.share.invite(group);
  }

  /**
   * Une pastille touchée : les scores de ce groupe seulement (les autres ne se lisent pas), et il devient celui que l'accueil et le classement
   * rouvrent. Un échec garde la carte telle qu'elle est : elle ne disparaît jamais sous le doigt.
   */
  protected async select(groupId: number): Promise<void> {
    const current = this.view();
    if (current === null || (current.kind !== 'pending' && current.kind !== 'revealed') || current.groupId === groupId) return;
    const request = ++this.latest;
    try {
      const view = groupCardView(await this.api.scores(groupId));
      if (request !== this.latest || view === null) return;
      this.lastGroup.set(groupId);
      this.view.set(view);
    } catch {
      // La carte reste sur le groupe d'avant.
    }
  }
}
