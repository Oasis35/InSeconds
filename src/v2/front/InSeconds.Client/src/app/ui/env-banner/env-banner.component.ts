import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Bandeau « DEV » en haut de toutes les pages, affiché uniquement sur le staging
 * (dev.inseconds.cc) : `App` lui passe `environment.name`, qui ne vaut 'staging' que dans
 * le build de configuration staging. Même rendu que le bandeau des emails du staging
 * (RedirectingEmailSender côté back). Présentationnel pur, non cliquable.
 */
@Component({
  selector: 'app-env-banner',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './env-banner.component.html',
})
export class EnvBannerComponent {
  readonly environmentName = input.required<string>();

  protected readonly visible = computed(() => this.environmentName() === 'staging');
}
