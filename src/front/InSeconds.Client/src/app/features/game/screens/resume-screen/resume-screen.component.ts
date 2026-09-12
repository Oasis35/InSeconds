import { Component, input, output, signal, inject, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { PlayerSessionService } from '../../../../core/services/player-session.service';

@Component({
  selector: 'app-resume-screen',
  imports: [TranslatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './resume-screen.component.html',
})
export class ResumeScreenComponent {
  protected readonly playerSession = inject(PlayerSessionService);

  readonly completedCount = input.required<number>();
  readonly trackCount = input.required<number>();
  readonly abandonLoading = input(false);
  readonly resumeGame = output<void>();
  readonly abandon = output<void>();

  protected readonly showAbandonConfirm = signal(false);
}
