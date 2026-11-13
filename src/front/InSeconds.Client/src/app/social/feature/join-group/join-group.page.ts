import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { SessionStore } from '../../../core/session/session.store';
import { BrandComponent } from '../../../ui/brand/brand.component';
import { ButtonComponent } from '../../../ui/button/button.component';
import { DecorBackgroundComponent } from '../../../ui/decor-background/decor-background.component';
import { PendingInvite } from '../../data-access/pending-invite';
import { SocialApi } from '../../data-access/social.api';
import { Invitation, isInviteCode } from '../../domain/group';

/** Le message de chaque refus de l'adhésion (les autres : une erreur à réessayer). */
const REFUSAL_KEYS: Readonly<Record<string, string>> = {
  group_full: 'social.join.full',
  too_many_groups: 'social.create.tooMany',
  account_required: 'social.join.accountRequired',
};

/**
 * Le lien d'invitation d'un groupe (`/ranking/join/<code>`) : le nom du groupe et ses places (jamais un pseudo), puis « Rejoindre » pour un
 * compte. Sans compte, l'invitation est gardée dans le navigateur le temps d'en créer un : le classement la repropose ensuite.
 */
@Component({
  selector: 'app-join-group-page',
  imports: [TranslatePipe, RouterLink, DecorBackgroundComponent, BrandComponent, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './join-group.page.html',
})
export class JoinGroupPage implements OnInit {
  protected readonly session = inject(SessionStore);
  private readonly api = inject(SocialApi);
  private readonly pending = inject(PendingInvite);
  private readonly router = inject(Router);
  private readonly code = inject(ActivatedRoute).snapshot.paramMap.get('code');

  protected readonly status = signal<'loading' | 'ready' | 'not_found' | 'error'>('loading');
  protected readonly invitation = signal<Invitation | null>(null);
  protected readonly busy = signal(false);
  protected readonly error = signal<string | null>(null);

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    if (!isInviteCode(this.code)) {
      this.status.set('not_found');
      return;
    }
    this.status.set('loading');
    const outcome = await this.api.invitation(this.code);
    if (outcome.kind === 'ok') {
      this.invitation.set(outcome.invitation);
      this.status.set('ready');
      // Sans compte, l'invitation attend la connexion ; avec, elle se règle ici.
      if (!outcome.invitation.alreadyMember) this.pending.set(this.code);
      else this.pending.clear();
    } else {
      if (outcome.kind === 'invitation_not_found') this.pending.clear();
      this.status.set(outcome.kind === 'invitation_not_found' ? 'not_found' : 'error');
    }
  }

  protected async join(): Promise<void> {
    if (this.busy() || !isInviteCode(this.code)) return;
    this.busy.set(true);
    this.error.set(null);
    const outcome = await this.api.join(this.code);
    if (outcome.kind === 'ok') {
      this.pending.clear();
      await this.router.navigate(['/ranking'], { queryParams: { group: outcome.group.id }, replaceUrl: true });
      return;
    }
    this.busy.set(false);
    // Un refus définitif (invitation disparue, groupe complet, trop de groupes) : l'invitation n'est plus proposée.
    if (outcome.kind === 'invitation_not_found' || outcome.kind === 'group_full' || outcome.kind === 'too_many_groups') this.pending.clear();
    if (outcome.kind === 'invitation_not_found') this.status.set('not_found');
    else this.error.set(REFUSAL_KEYS[outcome.kind] ?? 'social.join.failed');
  }
}
