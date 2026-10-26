import { Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { SHARE_LINK, ShareService } from '../../core/share/share.service';
import { ShareTrack, dayLabel, shareLine } from '../domain/share-text';

/**
 * Le partage du score : la date, une ligne de `✅`/`🔶`/`🅾️`, le score et le lien, par le menu de partage du téléphone ou sinon
 * dans le presse-papier, et l'état du bouton (copié, échec) pour quelques secondes. Un partage natif ou un menu fermé ne change rien au bouton.
 */
@Injectable()
export class DailyShare {
  private readonly sharing = inject(ShareService);
  private readonly translate = inject(TranslateService);

  private readonly _copied = signal(false);
  private readonly _failed = signal(false);
  readonly copied = this._copied.asReadonly();
  readonly failed = this._failed.asReadonly();

  async share(tracks: readonly ShareTrack[], score: number): Promise<void> {
    const text = [
      this.translate.instant('daily.share.title', { date: dayLabel(new Date()) }),
      shareLine(tracks),
      this.translate.instant('daily.share.score', { score: new Intl.NumberFormat(this.translate.getCurrentLang() ?? 'fr').format(score) }),
      SHARE_LINK,
    ].join('\n');
    const outcome = await this.sharing.share(text);
    if (outcome !== 'copied' && outcome !== 'failed') return;
    const flag = outcome === 'copied' ? this._copied : this._failed;
    flag.set(true);
    setTimeout(() => flag.set(false), outcome === 'copied' ? 2000 : 3000);
  }
}
