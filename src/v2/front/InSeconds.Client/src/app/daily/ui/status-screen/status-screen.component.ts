import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/** Écran d'état générique (pas de défi / erreur) : titre + corps + bouton réessayer. */
@Component({
  selector: 'app-status-screen',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './status-screen.component.html',
  host: { class: 'flex-1 flex flex-col' },
})
export class StatusScreenComponent {
  readonly titleKey = input.required<string>();
  readonly bodyKey = input.required<string>();
  /** Code d'erreur (traceId renvoyé par l'API) que le joueur peut communiquer, masqué si absent. */
  readonly errorCode = input<string | null>(null);
  readonly retry = output<void>();
}
