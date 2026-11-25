import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { LanguageService } from '../../../core/i18n/language.service';
import { SessionStore } from '../../../core/session/session.store';
import { ShellChromeStore } from '../../../core/shell/shell-chrome.store';
import { GroupShare } from '../../data-access/group-share';
import { GroupsAnnounce } from '../../data-access/groups-announce';
import { LastGroup } from '../../data-access/last-group';
import { SocialApi } from '../../data-access/social.api';
import { provideSocialApi } from '../../data-access/social.providers';
import { FriendsCardView, groupCardView } from '../../domain/friends-card';
import { Group, preferredGroupId } from '../../domain/group';
import { FriendsHomeCardComponent } from '../../ui/friends-home-card/friends-home-card.component';

/**
 * L'entrée des groupes sur l'accueil, chargée à la demande, pour les comptes : un compte sans groupe
 * y trouve qu'il peut en créer un, un membre voit son groupe (le dernier regardé, au classement ou ici, sinon le premier) et, dans plusieurs groupes, une
 * pastille chacun pour en changer (`select`, les scores du seul groupe choisi). Les scores du jour n'arrivent qu'une fois
 * son propre défi fini : c'est le serveur qui le décide (`todayRevealed`), la carte se relit quand le défi du jour se termine. Un invité n'a pas de carte : l'accueil lui propose le compte à part (tuile sous le défi). Une erreur ne montre
 * rien : la carte est un plus, jamais une panne de l'accueil.
 */
@Component({
  selector: 'app-social-home-entry',
  imports: [FriendsHomeCardComponent],
  providers: [provideSocialApi(), GroupShare],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (shownView(); as view) {
      <div class="pt-3">
        <app-friends-home-card [view]="view" [lang]="lang()" [showNew]="announce.chip()" [groups]="groups()" [canCreate]="canCreate() && !announce.card()"
          [inviteState]="inviteState()" (groupSelected)="select($event)" (invite)="invite($event)" />
      </div>
    } @else if (reserving() && view() === null) {
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
  protected readonly announce = inject(GroupsAnnounce);
  private readonly language = inject(LanguageService);
  private readonly share = inject(GroupShare);
  protected readonly inviteState = computed<'idle' | 'copied' | 'failed'>(() => {
    if (this.share.copied()) return 'copied';
    return this.share.failed() ? 'failed' : 'idle';
  });

  protected readonly view = signal<FriendsCardView | null>(null);
  /** Les groupes du joueur : dès qu'il y en a plusieurs, la carte offre une pastille chacun. */
  protected readonly groups = signal<readonly Group[]>([]);
  private readonly maxGroups = signal(0);
  /** Sous le maximum de groupes (`Social:MaxGroupsPerPlayer`, rendu par le serveur) : « Créer un nouveau groupe » reste offert. */
  protected readonly canCreate = computed(() => this.groups().length > 0 && this.groups().length < this.maxGroups());
  /**
   * La carte amis, sauf pour un compte sans groupe tant que l'annonce des groupes est ouverte : elle dit déjà la même chose
   * (« Créer un groupe »), une seule tuile s'ajoute au défi. Fermée, la carte revient avec sa pastille « Nouveau ».
   */
  protected readonly shownView = computed(() => {
    const view = this.view();
    return view !== null && this.announce.card() && view.kind === 'no_group' ? null : view;
  });
  /** La carte d'un compte se lit (deux appels) : sa place est gardée, vide, tant qu'elle n'est pas là. */
  protected readonly reserving = signal(false);
  protected readonly lang = computed<'fr' | 'en'>(() => (this.language.current() === 'en' ? 'en' : 'fr'));
  private latest = 0;
  /** Les touchers de pastille : seul le dernier compte. */
  private selection = 0;
  /** Le groupe touché dont les scores arrivent, jamais montré avant : le chargement de la carte le suit au lieu de le défaire. */
  private chosen: number | null = null;
  /** Les cartes posées par un chargement : une lecture de pastille commencée avant l'une d'elles est périmée. */
  private loaded = 0;

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
    // Une lecture de pastille commencée avant ce chargement (autre compte, déconnexion) est périmée.
    this.loaded++;
    if (!linked) {
      this.announce.setGroups([]);
      this.groups.set([]);
      this.maxGroups.set(0);
      this.view.set(null);
      this.reserving.set(false);
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
      this.announce.setGroups(mine, max);
      const ids = mine.map(group => group.id);
      const groupId = preferredGroupId(ids, this.lastGroup.get());
      view = groupId === null ? { kind: 'no_group' } : groupCardView(await this.api.scores(groupId));
      // Une pastille touchée pendant cette lecture : on suit le dernier choix du joueur, pas celui d'avant, tant qu'il change.
      // Un échec de cette relecture garde la carte déjà lue (jamais de carte qui disparaît sous le doigt).
      let shownId = groupId;
      while (shownId !== null) {
        const wanted = preferredGroupId(ids, this.lastGroup.get());
        if (wanted === null || wanted === shownId) break;
        try {
          view = groupCardView(await this.api.scores(wanted));
          shownId = wanted;
        } catch {
          this.lastGroup.set(shownId);
          break;
        }
      }
    } catch {
      this.announce.setGroups('failed');
      view = null;
    }
    if (request !== this.latest) return;
    this.loaded++;
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
   * Une pastille touchée : les scores de ce groupe seulement (les autres ne se lisent pas), et il devient tout de suite celui que l'accueil et le
   * classement rouvrent, y compris pour un chargement de la carte en cours (le défi qui se termine). Plusieurs touchers de suite : le dernier
   * l'emporte. Un échec garde la carte telle qu'elle est, elle ne disparaît jamais sous le doigt.
   */
  protected async select(groupId: number): Promise<void> {
    const current = this.view();
    if (current === null || (current.kind !== 'pending' && current.kind !== 'revealed')) return;
    if ((this.chosen ?? current.groupId) === groupId) return;
    const request = ++this.selection;
    const loaded = this.loaded;
    this.chosen = groupId;
    this.lastGroup.set(groupId);
    let view: FriendsCardView | null = null;
    try {
      view = groupCardView(await this.api.scores(groupId));
    } catch {
      view = null;
    }
    if (request !== this.selection) return;
    this.chosen = null;
    // Un chargement a posé la carte entre-temps : il a suivi ce choix, sa carte est plus récente.
    if (loaded !== this.loaded) return;
    if (view !== null) {
      this.view.set(view);
      return;
    }
    // La carte reste sur le groupe d'avant, qui redevient aussi celui que l'accueil et le classement rouvrent.
    const shown = this.view();
    if (shown !== null && (shown.kind === 'pending' || shown.kind === 'revealed')) this.lastGroup.set(shown.groupId);
  }
}
