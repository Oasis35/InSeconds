import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-welcome-screen',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './welcome-screen.component.html',
})
export class WelcomeScreenComponent {
  readonly trackCount = input.required<number>();
  readonly startGame = output<void>();
}
