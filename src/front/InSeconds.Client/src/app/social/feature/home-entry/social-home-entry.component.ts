import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { LanguageService } from '../../../core/i18n/language.service';
import { SessionStore } from '../../../core/session/session.store';
import { ShellChromeStore } from '../../../core/shell/shell-chrome.store';
import { GroupsAnnounce } from '../../data-access/groups-announce';
import { LastGroup } from '../../data-access/last-group';
import { SocialApi } from '../../data-access/social.api';
import { provideSocialApi } from '../../data-access/social.providers';
import { FriendsCardView, groupCardView } from '../../domain/friends-card';
import { preferredGroupId } from '../../domain/group';
import { FriendsHomeCardComponent } from '../../ui/friends-home-card/friends-home-card.component';

/**
 * L'entrée des groupes sur l'accueil, chargée à la demande, pour tout le monde : un invité y lit qu'un groupe exige un compte, un compte sans groupe
 * qu'il peut en créer un, un membre voit son groupe (le dernier regardé au classement, sinon le premier). Les scores du jour n'arrivent qu'une fois
 * son propre défi fini : c'est le serveur qui le décide (`todayRevealed`), la carte se relit quand le défi du jour se termine. Une erreur ne montre
 * rien : la carte est un plus, jamais une panne de l'accueil.
 */
@Component({
  selector: 'app-social-home-entry',
  imports: [FriendsHomeCardComponent],
  providers: [provideSocialApi()],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (shownView(); as view) {
      <div class="pt-3"><app-friends-home-card [view]="view" [lang]="lang()" [showLogin]="!chrome.accountCtaShown()" [showNew]="announce.chip()" /></div>
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

  protected readonly view = signal<FriendsCardView | null>(null);
  /**
   * La carte amis, sauf pour un invité ou un compte sans groupe tant que l'annonce des groupes est ouverte : elle dit déjà la même chose
   * (« Créer un compte », « Créer un groupe »), une seule tuile s'ajoute au défi. Fermée, la carte revient avec sa pastille « Nouveau ».
   */
  protected readonly shownView = computed(() => {
    const view = this.view();
    return view !== null && this.announce.card() && (view.kind === 'guest' || view.kind === 'no_group') ? null : view;
  });
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
      this.announce.setGroups([]);
      this.view.set({ kind: 'guest' });
      return;
    }
    let view: FriendsCardView | null;
    if (this.view() === null) this.reserving.set(true);
    try {
      const { groups } = await this.api.myGroups();
      this.announce.setGroups(groups);
      const groupId = preferredGroupId(groups.map(group => group.id), this.lastGroup.get());
      view = groupId === null ? { kind: 'no_group' } : groupCardView(await this.api.scores(groupId));
    } catch {
      this.announce.setGroups('failed');
      view = null;
    }
    if (request !== this.latest) return;
    this.view.set(view);
    this.reserving.set(false);
  }
}
