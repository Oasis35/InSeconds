import { ChangeDetectionStrategy, Component, effect, inject, signal, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { map } from 'rxjs';
import { ErrorReportingService } from '../../../core/errors/error-reporting.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { SessionStore } from '../../../core/session/session.store';
import { AccountLinkComponent } from '../../../core/shell/account-link/account-link.component';
import { InstagramLinkComponent } from '../../../core/shell/instagram-link/instagram-link.component';
import { BrandComponent } from '../../../gameplay/ui/brand/brand.component';
import { ButtonComponent } from '../../../ui/button/button.component';
import { DecorBackgroundComponent } from '../../../ui/decor-background/decor-background.component';
import { ModalService } from '../../../ui/modal/modal.service';
import { GroupShare } from '../../data-access/group-share';
import { GroupsStore } from '../../data-access/groups.store';
import { PendingInvite } from '../../data-access/pending-invite';
import { RankingListComponent } from '../../ui/ranking-list/ranking-list.component';

/**
 * Le classement entre amis (`/ranking`, `?group=<id>`) : une pastille par groupe et « + Groupe », le classement du groupe choisi (la ligne du
 * joueur en orange), « Inviter un ami » et « Quitter le groupe ». Sans groupe : « Joue contre tes amis ». Sans compte : l'invitation à en créer
 * un (un groupe exige un compte). Seuls les membres d'un groupe voient les pseudos des autres : le serveur le garantit.
 */
@Component({
  selector: 'app-ranking-page',
  imports: [
    TranslatePipe, RouterLink, DecorBackgroundComponent, BrandComponent, AccountLinkComponent, InstagramLinkComponent, ButtonComponent, RankingListComponent,
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

  /** Une invitation reçue avant d'avoir un compte : proposée ici une fois connecté. */
  protected readonly pendingCode = signal(inject(PendingInvite).get());
  protected readonly leaveFailed = signal(false);

  /** Le groupe de l'adresse ; absent ou mal écrit : le premier. */
  private readonly groupId = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(map(params => {
      const id = Number(params.get('group'));
      return Number.isInteger(id) && id > 0 ? id : null;
    })),
    { initialValue: null },
  );

  constructor() {
    effect(() => {
      // L'identité se lit au démarrage de l'app : un invité n'a pas de groupe, on ne demande rien.
      if (!this.session.loaded() || !this.session.isLinked()) return;
      const groupId = this.groupId();
      untracked(() => {
        if (this.store.status() === 'ready' && groupId !== null) void this.store.select(groupId);
        else void this.store.load(groupId);
      });
    });
  }

  protected retry(): void {
    void this.store.load(this.groupId());
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
