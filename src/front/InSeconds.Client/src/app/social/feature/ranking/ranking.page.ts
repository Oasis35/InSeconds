import { ChangeDetectionStrategy, Component, computed, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { firstValueFrom, map } from 'rxjs';
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
import { GroupsAnnounce } from '../../data-access/groups-announce';
import { GroupsStore } from '../../data-access/groups.store';
import { PendingInvite } from '../../data-access/pending-invite';
import { ShellChromeStore } from '../../../core/shell/shell-chrome.store';
import { GroupView, groupViewOf, todayRows, weekRows } from '../../domain/group-scores';
import { LeaveOwnerData, LeaveOwnerSheet } from './leave-owner.sheet';
import { ManageGroupChoice, ManageGroupData, ManageGroupSheet } from './manage-group.sheet';
import { RenameGroupData, RenameGroupSheet } from './rename-group.sheet';
import { GeneralRankingComponent } from '../general-ranking/general-ranking.component';
import { ScoreListComponent } from '../../ui/score-list/score-list.component';
import { TodayPlayedComponent } from '../../ui/today-played/today-played.component';

/** Les deux onglets du classement d'un groupe, pour tous. */
const VIEWS: readonly { readonly id: GroupView; readonly labelKey: string }[] = [
  { id: 'week', labelKey: 'social.scores.week' },
  { id: 'today', labelKey: 'social.scores.today' },
];

/**
 * Le classement (`/ranking`, `?group=<id>`, `?period=today`, `?view=general`) : une pastille par groupe et, sous le groupe, « Créer un nouveau groupe » (plus « Général », le
 * classement général par niveau, pour qui a l'accès Survie), puis le classement du Défi du jour du groupe choisi, « Cette semaine » (points des
 * sept derniers jours et un point par jour joué) ou « Aujourd'hui » (fermé tant que le joueur n'a pas fini son défi : seulement qui a joué). La
 * ligne du joueur est en orange. Puis « Inviter un ami » et « Quitter le groupe ». Seul dans son groupe : l'invitation à y faire venir ses amis. Sans groupe : « Joue contre tes amis ». Sans compte : l'invitation à en
 * créer un (un groupe exige un compte). Seuls les membres d'un groupe voient les pseudos des autres : le serveur le garantit.
 */
@Component({
  selector: 'app-ranking-page',
  imports: [HomeLegalLineComponent,
    TranslatePipe, RouterLink, DecorBackgroundComponent, BrandComponent, AccountLinkComponent, InstagramLinkComponent, ButtonComponent,
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
  private readonly announce = inject(GroupsAnnounce);
  private readonly params = inject(ActivatedRoute).queryParamMap;

  /** Une invitation reçue avant d'avoir un compte : proposée ici une fois connecté. */
  protected readonly pendingCode = signal(inject(PendingInvite).get());
  protected readonly leaveFailed = signal(false);
  protected readonly transferFailed = signal(false);
  protected readonly renameFailed = signal(false);

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
  /** L'onglet du groupe : la semaine par défaut. */
  protected readonly view = computed(() => groupViewOf(this.period()));
  protected readonly views = VIEWS;
  /** L'onglet tel qu'il s'écrit dans l'adresse (la semaine n'y figure pas) : changer de groupe le garde. */
  protected readonly periodParam = computed(() => (this.view() === 'week' ? null : this.view()));

  protected readonly daily = computed(() => this.store.selectedScores()?.daily ?? null);
  protected readonly weekRows = computed(() => { const daily = this.daily(); return daily ? weekRows(daily) : []; });
  protected readonly todayRows = computed(() => { const daily = this.daily(); return daily ? todayRows(daily) : []; });
  /** Le joueur est seul dans le groupe choisi : rien à classer, il faut inviter. */
  protected readonly alone = computed(() => (this.store.selected()?.memberCount ?? 0) <= 1);

  constructor() {
    // Onglet Groupes ouvert : le point « Nouveau » de l'onglet a fait son travail.
    this.announce.markRankingSeen();
    effect(() => {
      // L'identité se lit au démarrage de l'app : un invité n'a pas de groupe, on ne demande rien.
      if (!this.session.loaded() || !this.session.isLinked()) return;
      const groupId = this.groupId();
      const status = this.store.status();
      untracked(() => {
        if (status === 'idle') void this.store.load(groupId);
        else if (status === 'ready') {
          // Le store ne relit que ce qui manque : les scores d'un autre groupe.
          const target = groupId ?? this.store.selectedId();
          if (target !== null) void this.store.select(target);
        }
      });
    });
  }

  protected retry(): void {
    void this.store.load(this.groupId());
  }

  /** Le classement du groupe en panne : le store le relit. */
  protected retryGroup(): void {
    const id = this.store.selectedId();
    if (id !== null) void this.store.select(id);
  }

  /**
   * Quitter le groupe. Un simple membre confirme. Le créateur seul le supprime en partant (la confirmation le dit) ; le créateur qui laisse d'autres
   * membres choisit d'abord qui le devient parmi eux, sinon il ne part pas.
   */
  protected async leave(): Promise<void> {
    const group = this.store.selected();
    if (!group) return;
    this.leaveFailed.set(false);
    let successor: string | null = null;
    if (group.isOwner && group.memberCount > 1) {
      const members = this.otherMembers();
      if (members.length === 0) {
        // Les membres ne sont pas lus (panne) : sans eux, personne à désigner.
        this.leaveFailed.set(true);
        return;
      }
      const chosen = await this.pickSuccessor({
        title: this.translate.instant('social.leave.title', { name: group.name }),
        body: this.translate.instant('social.leave.ownerBody'),
        confirmLabel: this.translate.instant('social.leave.ownerConfirm'),
        danger: true,
        members,
      });
      if (chosen === null) return;
      successor = chosen;
    } else {
      const confirmed = await this.modal.confirm({
        title: this.translate.instant('social.leave.title', { name: group.name }),
        body: this.translate.instant(group.isOwner ? 'social.leave.lastBody' : 'social.leave.body'),
        confirmLabel: this.translate.instant(group.isOwner ? 'social.leave.lastConfirm' : 'social.leave.confirm'),
        cancelLabel: this.translate.instant('social.leave.cancel'),
        tone: 'danger',
      });
      if (!confirmed) return;
    }
    if (await this.store.leave(group.id, successor)) void this.router.navigate(['/ranking'], { replaceUrl: true });
    else this.leaveFailed.set(true);
  }

  /** « Gérer le groupe » : ce que seul le créateur peut faire. La feuille propose renommer et, avec d'autres membres, changer de créateur. */
  protected async manage(): Promise<void> {
    const group = this.store.selected();
    if (!group?.isOwner) return;
    const ref = this.modal.openSheet<ManageGroupChoice | null, ManageGroupData, ManageGroupSheet>(ManageGroupSheet, {
      data: { canTransfer: group.memberCount > 1 },
    });
    const choice = (await firstValueFrom(ref.closed)) ?? null;
    if (choice === 'rename') await this.rename();
    else if (choice === 'transfer') await this.transfer();
  }

  /** Le créateur renomme son groupe : le nom est validé par le serveur, la liste relue. */
  private async rename(): Promise<void> {
    const group = this.store.selected();
    if (!group?.isOwner) return;
    this.renameFailed.set(false);
    const ref = this.modal.openSheet<string | null, RenameGroupData, RenameGroupSheet>(RenameGroupSheet, { data: { name: group.name } });
    const name = (await firstValueFrom(ref.closed)) ?? null;
    if (name !== null && !(await this.store.rename(group.id, name))) this.renameFailed.set(true);
  }

  /** Les autres membres du groupe regardé, lus avec ses scores ; vide tant que la lecture n'a pas abouti. */
  private otherMembers(): string[] {
    return (this.store.selectedScores()?.daily?.today ?? []).filter(entry => !entry.isMe).map(entry => entry.pseudo);
  }

  /** Le créateur passe la main à un autre membre sans partir : il devient un simple membre. */
  private async transfer(): Promise<void> {
    const group = this.store.selected();
    if (!group?.isOwner) return;
    this.leaveFailed.set(false);
    this.transferFailed.set(false);
    const members = this.otherMembers();
    if (members.length === 0) {
      this.transferFailed.set(true);
      return;
    }
    const chosen = await this.pickSuccessor({
      title: this.translate.instant('social.transfer.title', { name: group.name }),
      body: this.translate.instant('social.transfer.body'),
      confirmLabel: this.translate.instant('social.transfer.confirm'),
      members,
    });
    if (chosen !== null && !(await this.store.transferOwner(group.id, chosen))) this.transferFailed.set(true);
  }

  private async pickSuccessor(data: LeaveOwnerData): Promise<string | null> {
    const ref = this.modal.openSheet<string | null, LeaveOwnerData, LeaveOwnerSheet>(LeaveOwnerSheet, { data });
    return (await firstValueFrom(ref.closed)) ?? null;
  }
}
