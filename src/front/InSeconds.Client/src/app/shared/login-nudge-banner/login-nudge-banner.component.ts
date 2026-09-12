import { Component, input, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-login-nudge-banner',
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './login-nudge-banner.component.html',
})
export class LoginNudgeBannerComponent {
  /** Clés i18n du titre et du corps (le CTA reste fixe, clé `loginNudge.cta`). */
  readonly titleKey = input.required<string>();
  readonly bodyKey = input.required<string>();
  /** Paramètres d'interpolation optionnels pour bodyKey (ex: { streak }). */
  readonly bodyParams = input<Record<string, unknown>>({});
}
