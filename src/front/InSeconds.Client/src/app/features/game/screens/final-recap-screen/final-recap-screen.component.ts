import { Component, input, output, ChangeDetectionStrategy } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

export interface RoundResult {
  artistCorrect: boolean;
  titleCorrect: boolean;
  score: number;
  correctArtist: string;
  correctTitle: string;
  listenedDurationSeconds: number;
  averageSecondsWhenCorrect: number | undefined;
  failureRatePercent: number;
  position: number;
  coverUrl: string | null;
  deezerTrackId: number;
}

@Component({
  selector: 'app-final-recap-screen',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './final-recap-screen.component.html',
})
export class FinalRecapScreenComponent {
  readonly results = input.required<RoundResult[]>();
  readonly displayedScore = input.required<number>();
  readonly shareCopied = input(false);
  readonly canShare = input(true);
  readonly share = output<void>();
}
