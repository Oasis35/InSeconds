import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/** Écran d'état générique (pas de défi / erreur) : titre + corps + bouton réessayer. */
@Component({
  selector: 'app-status-screen',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './status-screen.component.html',
})
export class StatusScreenComponent {
  readonly titleKey = input.required<string>();
  readonly bodyKey = input.required<string>();
  readonly retry = output<void>();
}
