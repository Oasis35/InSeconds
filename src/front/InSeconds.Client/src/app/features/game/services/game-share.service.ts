import { Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ClipboardService } from '../../../core/services/clipboard.service';
import { TodayStatsResponse } from '../../../api/api.generated';
import { environment } from '../../../../environments/environment';
import { RoundResult } from '../screens/final-recap-screen/final-recap-screen.component';

/** Construit le texte de partage (récap final ou stats "déjà joué") et gère la copie presse-papier. */
@Injectable()
export class GameShareService {
  private readonly clipboard = inject(ClipboardService);
  private readonly translate = inject(TranslateService);

  readonly copied = signal(false);
  readonly failed = signal(false);

  shareResults(results: readonly RoundResult[], totalScore: number): void {
    const lines = results.map(r => {
      const artist = r.artistCorrect ? '✅' : '❌';
      const title  = r.titleCorrect  ? '✅' : '❌';
      return `${artist}/${title} ${r.listenedDurationSeconds}s`;
    });

    this.copyText([
      this.translate.instant('share.title', { date: this.todayLabel() }),
      lines.join('\n'),
      this.translate.instant('share.score', { score: totalScore }),
      environment.appUrl,
    ].join('\n'));
  }

  shareStats(stats: TodayStatsResponse): void {
    const lines = stats.tracks.map(t => {
      if (t.listenedDurationSeconds == null) return null;
      const artist = t.artistCorrect ? '✅' : '❌';
      const title  = t.titleCorrect  ? '✅' : '❌';
      return `${artist}/${title} ${t.listenedDurationSeconds}s`;
    }).filter(Boolean);

    this.copyText([
      this.translate.instant('share.title', { date: this.todayLabel() }),
      lines.join('\n'),
      this.translate.instant('share.score', { score: stats.yourScore }),
      environment.appUrl,
    ].join('\n'));
  }

  private todayLabel(): string {
    const date = new Date();
    return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  private copyText(text: string): void {
    this.clipboard.copy(text).then(ok => {
      if (ok) {
        this.copied.set(true);
        setTimeout(() => this.copied.set(false), 2000);
      } else {
        this.failed.set(true);
        setTimeout(() => this.failed.set(false), 3000);
      }
    });
  }
}
