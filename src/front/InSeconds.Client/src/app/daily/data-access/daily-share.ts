import { Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { SHARE_LINK, ShareService } from '../../core/share/share.service';
import { todayUtc } from '../domain/countdown';
import { FormatDuration, ShareTrack, dayLabel, shareLines } from '../domain/share-text';

/**
 * Le partage du score : une première ligne avec le score, le nom et la date (ce qui se lit dans l'aperçu d'une conversation), une
 * ligne par morceau (`✅`/`❌` de l'artiste puis du titre, palier écouté), puis le lien, par le menu de partage du téléphone ou sinon
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

  /** `formatDuration` met le palier écouté au format de la langue (`formatSeconds`, que la page fournit : `data-access` ne voit pas `ui`). */
  async share(tracks: readonly ShareTrack[], score: number, formatDuration: FormatDuration): Promise<void> {
    const lang = this.translate.getCurrentLang() ?? 'fr';
    const text = [
      // Le jour de jeu (UTC), comme la date de la page : à 0 h 30 à Paris, le défi est encore celui de la veille.
      this.translate.instant('daily.share.header', { score: new Intl.NumberFormat(lang).format(score), date: dayLabel(todayUtc(new Date())) }),
      ...shareLines(tracks, formatDuration, lang),
      SHARE_LINK,
    ].join('\n');
    const outcome = await this.sharing.share(text);
    if (outcome !== 'copied' && outcome !== 'failed') return;
    const flag = outcome === 'copied' ? this._copied : this._failed;
    flag.set(true);
    setTimeout(() => flag.set(false), outcome === 'copied' ? 2000 : 3000);
  }
}
