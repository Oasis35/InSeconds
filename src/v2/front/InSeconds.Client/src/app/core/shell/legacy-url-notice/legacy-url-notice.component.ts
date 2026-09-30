import { ChangeDetectionStrategy, Component, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonComponent } from '../../../ui/button/button.component';

/**
 * Avis « l'adresse a changé, pense à mettre à jour ton favori », affiché quand on arrive par
 * l'ancienne adresse du front (cf. `consumeLegacyUrlFlag`). Repris de la v1.
 */
@Component({
  selector: 'app-legacy-url-notice',
  imports: [TranslatePipe, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './legacy-url-notice.component.html',
})
export class LegacyUrlNoticeComponent {
  readonly dismissed = output<void>();
}
