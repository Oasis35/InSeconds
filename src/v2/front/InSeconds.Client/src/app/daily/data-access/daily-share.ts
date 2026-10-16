import { Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ClipboardService } from '../../core/clipboard/clipboard.service';
import { environment } from '../../../environments/environment';
import { ShareTrack, dayLabel, shareLines } from '../domain/share-text';

/** Le partage du score : le texte `✅/❌` de la partie dans le presse-papier, et l'état du bouton (copié, échec) pour quelques secondes. */
@Injectable()
export class DailyShare {
  private readonly clipboard = inject(ClipboardService);
  private readonly translate = inject(TranslateService);

  private readonly _copied = signal(false);
  private readonly _failed = signal(false);
  readonly copied = this._copied.asReadonly();
  readonly failed = this._failed.asReadonly();

  async share(tracks: readonly ShareTrack[], score: number): Promise<void> {
    const text = [
      this.translate.instant('daily.share.title', { date: dayLabel(new Date()) }),
      shareLines(tracks).join('\n'),
      this.translate.instant('daily.share.score', { score }),
      environment.appUrl,
    ].join('\n');
    const ok = await this.clipboard.copy(text);
    const flag = ok ? this._copied : this._failed;
    flag.set(true);
    setTimeout(() => flag.set(false), ok ? 2000 : 3000);
  }
}
