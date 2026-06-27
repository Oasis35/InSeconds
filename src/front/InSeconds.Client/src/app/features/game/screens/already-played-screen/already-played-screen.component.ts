import { Component, input, output, signal, ChangeDetectionStrategy } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { TodayStatsResponse } from '../../../../api/api.generated';
import { ShareButtonComponent } from '../../../../shared/share-button/share-button.component';

@Component({
  selector: 'app-already-played-screen',
  imports: [TranslatePipe, ShareButtonComponent],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './already-played-screen.component.html',
})
export class AlreadyPlayedScreenComponent {
  readonly stats = input<TodayStatsResponse | null>(null);
  readonly abandoned = input(false);
  readonly countdown = input.required<string>();
  readonly shareCopied = input(false);
  readonly share = output<void>();

  protected readonly showTrackDetails = signal(false);
}
