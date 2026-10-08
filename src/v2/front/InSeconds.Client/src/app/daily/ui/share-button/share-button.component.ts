import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/** Bouton « Partager mon score » (écran « déjà joué » et récap final). */
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
  readonly share = output<void>();
}
