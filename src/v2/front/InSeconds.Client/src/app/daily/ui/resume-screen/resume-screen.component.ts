import { Component, input, output, signal, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';

/** Reprise d'une partie en cours, avec confirmation d'abandon en deux temps. */
@Component({
  selector: 'app-resume-screen',
  imports: [TranslatePipe, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './resume-screen.component.html',
  host: { class: 'flex-1 flex flex-col' },
})
export class ResumeScreenComponent {
  readonly completedCount = input.required<number>();
  readonly trackCount = input.required<number>();
  readonly abandonLoading = input(false);
  readonly linked = input.required<boolean>();
  readonly resumeGame = output<void>();
  readonly abandon = output<void>();

  protected readonly showAbandonConfirm = signal(false);
}
