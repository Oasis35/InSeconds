import { Component, input, output, inject, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { PlayerSessionService } from '../../../../core/services/player-session.service';

@Component({
  selector: 'app-welcome-screen',
  imports: [TranslatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './welcome-screen.component.html',
})
export class WelcomeScreenComponent {
  protected readonly playerSession = inject(PlayerSessionService);

  readonly trackCount = input.required<number>();
  readonly startGame = output<void>();
}
