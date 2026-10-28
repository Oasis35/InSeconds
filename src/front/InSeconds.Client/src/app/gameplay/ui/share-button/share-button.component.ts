import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/**
 * Le bouton de partage de la fin d'une partie, commun aux modes (un mode n'importe pas l'autre) : « Partager mon score » au Daily, « Partager la
 * playlist » aux Platines. Chaque mode donne ses clés de traduction ; les défauts sont ceux du Daily.
 */
@Component({
  selector: 'app-share-button',
  imports: [TranslatePipe],
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
  readonly share = output<void>();
}
