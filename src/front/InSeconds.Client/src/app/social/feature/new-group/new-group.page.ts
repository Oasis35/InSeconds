import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { SessionStore } from '../../../core/session/session.store';
import { BrandComponent } from '../../../gameplay/ui/brand/brand.component';
import { ButtonComponent } from '../../../ui/button/button.component';
import { DecorBackgroundComponent } from '../../../ui/decor-background/decor-background.component';
import { GroupShare } from '../../data-access/group-share';
import { SocialApi } from '../../data-access/social.api';
import { GROUP_NAME_MAX, isGroupNameValid } from '../../domain/group';

/** Le message de chaque refus de la création (les autres : une erreur à réessayer). */
const REFUSAL_KEYS: Readonly<Record<string, string>> = {
  invalid_name: 'errors.social.invalid_name',
  too_many_groups: 'social.create.tooMany',
  account_required: 'social.create.accountRequired',
};

/**
 * La création d'un groupe (`/ranking/new`) : un nom, trois étapes d'une ligne, et « Créer et inviter » qui crée le groupe, ouvre le partage du
 * téléphone avec son lien puis montre son classement. Un groupe exige un compte : sans lui, l'écran invite à en créer un.
 */
@Component({
  selector: 'app-new-group-page',
  imports: [TranslatePipe, RouterLink, DecorBackgroundComponent, BrandComponent, ButtonComponent],
  providers: [GroupShare],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './new-group.page.html',
})
export class NewGroupPage {
  protected readonly session = inject(SessionStore);
  private readonly api = inject(SocialApi);
  private readonly share = inject(GroupShare);
  private readonly router = inject(Router);

  protected readonly maxLength = GROUP_NAME_MAX;
  protected readonly name = signal('');
  protected readonly busy = signal(false);
  /** La clé de traduction du refus de la dernière demande, `null` sans refus. */
  protected readonly error = signal<string | null>(null);
  protected readonly valid = computed(() => isGroupNameValid(this.name()));

  protected async submit(): Promise<void> {
    if (this.busy()) return;
    if (!this.valid()) {
      this.error.set(REFUSAL_KEYS['invalid_name']);
      return;
    }
    this.busy.set(true);
    this.error.set(null);
    const outcome = await this.api.create(this.name());
    if (outcome.kind !== 'ok') {
      this.busy.set(false);
      this.error.set(REFUSAL_KEYS[outcome.kind] ?? 'social.create.failed');
      return;
    }
    // Le partage suit le clic d'aussi près que possible ; s'il est refusé, « Inviter un ami » attend sur le classement du groupe.
    await this.share.invite(outcome.group);
    await this.router.navigate(['/ranking'], { queryParams: { group: outcome.group.id }, replaceUrl: true });
  }
}
