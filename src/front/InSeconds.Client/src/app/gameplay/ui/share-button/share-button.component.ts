import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonComponent, ButtonVariant } from '../../../ui/button/button.component';

/**
 * Le bouton de partage de la fin d'une partie, commun aux modes (un mode n'importe pas l'autre) : « Partager mon score » au Daily, « Partager mon
 * score » (en contour neutre sous « Rejouer ») et « Partager la playlist » aux Setlist. Chaque mode donne ses clés de traduction ; les défauts sont ceux du Daily.
 */
@Component({
  selector: 'app-share-button',
  imports: [TranslatePipe, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './share-button.component.html',
})
export class ShareButtonComponent {
  readonly copied = input.required<boolean>();
  readonly failed = input(false);
  readonly disabled = input(false);
  readonly labelKey = input('daily.share.button');
  readonly copiedKey = input('daily.share.copied');
  readonly failedKey = input('daily.share.failed');
  /** Principal (le Daily) ; neutre quand une autre action est la principale de l'écran (« Rejouer » à la fin d'un run). */
  readonly variant = input<ButtonVariant>('primary');
  readonly glow = input(true);
  readonly share = output<void>();
}
