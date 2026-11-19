import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { LanguageService } from '../../../core/i18n/language.service';
import { SessionStore } from '../../../core/session/session.store';
import { ShellChromeStore } from '../../../core/shell/shell-chrome.store';
import { LastGroup } from '../../data-access/last-group';
import { SocialApi } from '../../data-access/social.api';
import { provideSocialApi } from '../../data-access/social.providers';
import { FriendsCardView, cardGroupId, groupCardView } from '../../domain/group-scores';
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
    @if (view(); as view) {
      <div class="pt-3"><app-friends-home-card [view]="view" [lang]="lang()" /></div>
    }
  `,
})
export class SocialHomeEntryComponent {
  private readonly session = inject(SessionStore);
  private readonly chrome = inject(ShellChromeStore);
  private readonly api = inject(SocialApi);
  private readonly lastGroup = inject(LastGroup);
  private readonly language = inject(LanguageService);

  protected readonly view = signal<FriendsCardView | null>(null);
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
    try {
      const { groups } = await this.api.myGroups();
      const groupId = cardGroupId(groups.map(group => group.id), this.lastGroup.get());
      view = groupId === null ? { kind: 'no_group' } : groupCardView(await this.api.scores(groupId));
    } catch {
      view = null;
    }
    if (request === this.latest) this.view.set(view);
  }
}
