import { Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ShareService } from '../../core/share/share.service';
import { environment } from '../../../environments/environment';
import { Group, groupInviteUrl } from '../domain/group';

/** Le texte d'une invitation : une phrase avec le nom du groupe, puis le lien qui le fait rejoindre. */
export function groupInviteText(group: Pick<Group, 'name' | 'inviteCode'>, t: (key: string, params?: Record<string, unknown>) => string): string {
  return [t('social.invite.text', { name: group.name }), groupInviteUrl(environment.appUrl, group.inviteCode)].join('\n');
}

/**
 * L'invitation dans un groupe, par le menu de partage du téléphone ou sinon dans le presse-papier, et l'état du bouton (copié, échec) pour
 * quelques secondes, comme le partage d'un score. À appeler dans le clic.
 */
@Injectable()
export class GroupShare {
  private readonly sharing = inject(ShareService);
  private readonly translate = inject(TranslateService);

  private readonly _copied = signal(false);
  private readonly _failed = signal(false);
  readonly copied = this._copied.asReadonly();
  readonly failed = this._failed.asReadonly();

  async invite(group: Pick<Group, 'name' | 'inviteCode'>): Promise<void> {
    const outcome = await this.sharing.share(groupInviteText(group, (key, params) => this.translate.instant(key, params)));
    if (outcome !== 'copied' && outcome !== 'failed') return;
    const flag = outcome === 'copied' ? this._copied : this._failed;
    flag.set(true);
    setTimeout(() => flag.set(false), outcome === 'copied' ? 2000 : 3000);
  }
}
