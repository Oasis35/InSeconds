import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { map } from 'rxjs';
import { ErrorReportingService } from '../../../core/errors/error-reporting.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { SessionStore } from '../../../core/session/session.store';
import { AccountLinkComponent } from '../../../core/shell/account-link/account-link.component';
import { InstagramLinkComponent } from '../../../core/shell/instagram-link/instagram-link.component';
import { HomeLegalLineComponent } from '../../../ui/legal-line/home-legal-line.component';
import { BrandComponent } from '../../../ui/brand/brand.component';
import { ButtonComponent } from '../../../ui/button/button.component';
import { DecorBackgroundComponent } from '../../../ui/decor-background/decor-background.component';
import { ModalService } from '../../../ui/modal/modal.service';
import { GroupShare } from '../../data-access/group-share';
import { GroupsStore } from '../../data-access/groups.store';
import { PendingInvite } from '../../data-access/pending-invite';
import { ShellChromeStore } from '../../../core/shell/shell-chrome.store';
import { GroupView, groupViewOf, todayRows, weekRows } from '../../domain/group-scores';
import { GeneralRankingComponent } from '../general-ranking/general-ranking.component';
import { RankingListComponent } from '../../ui/ranking-list/ranking-list.component';
import { ScoreListComponent } from '../../ui/score-list/score-list.component';
import { TodayPlayedComponent } from '../../ui/today-played/today-played.component';

/** Les onglets du classement d'un groupe ; « Survie » n'existe que pour qui en a l'accès. */
const VIEWS: readonly { readonly id: GroupView; readonly labelKey: string }[] = [
  { id: 'week', labelKey: 'social.scores.week' },
  { id: 'today', labelKey: 'social.scores.today' },
  { id: 'survie', labelKey: 'social.scores.survie' },
];

/**
 * Le classement (`/ranking`, `?group=<id>`, `?period=today|survie`, `?view=general`) : une pastille par groupe et « + Groupe » (plus « Général »,
 * le classement général par niveau, pour qui a l'accès Survie), puis le classement du Défi du jour du groupe choisi, « Cette semaine » (points des
 * sept derniers jours et un point par jour joué) ou « Aujourd'hui » (fermé tant que le joueur n'a pas fini son défi : seulement qui a joué). Avec
 * l'accès Survie, un troisième onglet garde le classement par niveau. La ligne du joueur est en orange. Puis « Inviter un ami » et « Quitter le
 * groupe ». Seul dans son groupe : l'invitation à y faire venir ses amis. Sans groupe : « Joue contre tes amis ». Sans compte : l'invitation à en
 * créer un (un groupe exige un compte). Seuls les membres d'un groupe voient les pseudos des autres : le serveur le garantit.
 */
@Component({
  selector: 'app-ranking-page',
  imports: [HomeLegalLineComponent,
    TranslatePipe, RouterLink, DecorBackgroundComponent, BrandComponent, AccountLinkComponent, InstagramLinkComponent, ButtonComponent, RankingListComponent,
    GeneralRankingComponent, ScoreListComponent, TodayPlayedComponent,
  ],
  providers: [GroupsStore, GroupShare],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ranking.page.html',
})
export class RankingPage {
  protected readonly store = inject(GroupsStore);
  protected readonly share = inject(GroupShare);
  protected readonly session = inject(SessionStore);
  protected readonly language = inject(LanguageService);
  protected readonly errorReporting = inject(ErrorReportingService);
  private readonly modal = inject(ModalService);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);
  private readonly params = inject(ActivatedRoute).queryParamMap;

  /** Une invitation reçue avant d'avoir un compte : proposée ici une fois connecté. */
  protected readonly pendingCode = signal(inject(PendingInvite).get());
  protected readonly leaveFailed = signal(false);

  /** Le groupe de l'adresse ; absent ou mal écrit : le premier. */
  private readonly groupId = toSignal(
    this.params.pipe(map(params => {
      const id = Number(params.get('group'));
      return Number.isInteger(id) && id > 0 ? id : null;
    })),
    { initialValue: null },
  );

  /** `?edit=name` (le lien du profil) : le choix du nom s'ouvre avec le classement général. */
  protected readonly editName = toSignal(this.params.pipe(map(params => params.get('edit') === 'name')), { initialValue: false });

  protected readonly chrome = inject(ShellChromeStore);
  private readonly generalRequested = toSignal(this.params.pipe(map(params => params.get('view') === 'general')), { initialValue: false });
  /** `?view=general` : le classement général à la place de celui d'un groupe, pour qui a l'accès Survie (il se classe par niveau). */
  protected readonly general = computed(() => this.generalRequested() && this.chrome.survieKnown() && this.chrome.survie());

  private readonly period = toSignal(this.params.pipe(map(params => params.get('period'))), { initialValue: null });
  /** L'onglet du groupe : la semaine par défaut ; « Survie » seulement avec l'accès. */
  protected readonly view = computed(() => groupViewOf(this.period(), this.chrome.survie()));
  protected readonly views = computed(() => VIEWS.filter(view => view.id !== 'survie' || this.chrome.survie()));
  /** L'onglet tel qu'il s'écrit dans l'adresse (la semaine n'y figure pas) : changer de groupe le garde. */
  protected readonly periodParam = computed(() => (this.view() === 'week' ? null : this.view()));

  protected readonly daily = computed(() => {
    const scores = this.store.scores();
    return scores && scores.groupId === this.store.selectedId() ? scores.daily : null;
  });
  protected readonly weekRows = computed(() => { const daily = this.daily(); return daily ? weekRows(daily) : []; });
  protected readonly todayRows = computed(() => { const daily = this.daily(); return daily ? todayRows(daily) : []; });
  /** Le joueur est seul dans le groupe choisi : rien à classer, il faut inviter. */
  protected readonly alone = computed(() => (this.store.selected()?.memberCount ?? 0) <= 1);

  constructor() {
    effect(() => {
      // L'identité se lit au démarrage de l'app : un invité n'a pas de groupe, on ne demande rien.
      if (!this.session.loaded() || !this.session.isLinked()) return;
      const groupId = this.groupId();
      const survie = this.view() === 'survie';
      const status = this.store.status();
      untracked(() => {
        if (status === 'idle') void this.store.load(groupId, survie);
        else if (status === 'ready') {
          // Le store ne relit que ce qui manque (un autre groupe, ou la Survie demandée pour la première fois).
          const target = groupId ?? this.store.selectedId();
          if (target !== null) void this.store.select(target, survie);
        }
      });
    });
  }

  protected retry(): void {
    void this.store.load(this.groupId(), this.view() === 'survie');
  }

  /** Un classement du groupe en panne : le store relit ce qui a échoué. */
  protected retryGroup(): void {
    const id = this.store.selectedId();
    if (id !== null) void this.store.select(id, this.view() === 'survie');
  }

  protected async leave(): Promise<void> {
    const group = this.store.selected();
    if (!group) return;
    const confirmed = await this.modal.confirm({
      title: this.translate.instant('social.leave.title', { name: group.name }),
      body: this.translate.instant('social.leave.body'),
      confirmLabel: this.translate.instant('social.leave.confirm'),
      cancelLabel: this.translate.instant('social.leave.cancel'),
      tone: 'danger',
    });
    if (!confirmed) return;
    this.leaveFailed.set(false);
    if (await this.store.leave(group.id)) void this.router.navigate(['/ranking'], { replaceUrl: true });
    else this.leaveFailed.set(true);
  }
}
