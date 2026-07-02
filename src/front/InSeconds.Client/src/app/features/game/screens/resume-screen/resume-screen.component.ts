import { Component, input, output, signal, ChangeDetectionStrategy } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

@Component({
  selector: 'app-resume-screen',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './resume-screen.component.html',
})
export class ResumeScreenComponent {
  readonly completedCount = input.required<number>();
  readonly trackCount = input.required<number>();
  readonly abandonLoading = input(false);
  readonly resumeGame = output<void>();
  readonly abandon = output<void>();

  protected readonly showAbandonConfirm = signal(false);
}
