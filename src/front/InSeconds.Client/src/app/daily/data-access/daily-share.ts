import { Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { SHARE_LINK, ShareService } from '../../core/share/share.service';
import { environment } from '../../../environments/environment';
import { todayUtc } from '../domain/countdown';
import { FormatDuration, ShareFormat, ShareTrack, dayLabel, shareGrid, shareLines } from '../domain/share-text';
import { DailyApi } from './daily.api';

/**
 * Le lien du format détaillé, marqué `utm_source=share-long` : les amis venus par lui se distinguent dans les sources d'arrivée de l'admin.
 * Le format court garde `SHARE_LINK` (`utm_source=share`), comme avant.
 */
export const LONG_SHARE_LINK = `${environment.appUrl}/?utm_source=share-long`;

/**
 * Le partage du score, en deux formats qui commencent par la même ligne (le score, le nom et la date, ce qui se lit dans l'aperçu d'une
 * conversation) et finissent par le lien :
 * - `short` : une ligne d'un emoji par morceau (`✅` / `🔶` / `🅾️`) ;
 * - `long` : une ligne par morceau (`✅`/`❌` de l'artiste puis du titre, palier écouté).
 * Par le menu de partage du téléphone, sinon dans le presse-papier, avec l'état du bouton (copié, échec) pour quelques secondes. Un partage
 * fait (menu validé ou texte copié) est compté par l'API, sans rien noter du joueur ; un menu fermé ou un échec ne compte pas.
 */
@Injectable()
export class DailyShare {
  private readonly sharing = inject(ShareService);
  private readonly translate = inject(TranslateService);
  private readonly api = inject(DailyApi);

  private readonly _copied = signal(false);
  private readonly _failed = signal(false);
  readonly copied = this._copied.asReadonly();
  readonly failed = this._failed.asReadonly();

  /** `formatDuration` met le palier écouté au format de la langue (`formatSeconds`, que la page fournit : `data-access` ne voit pas `ui`). */
  async share(tracks: readonly ShareTrack[], score: number, format: ShareFormat, formatDuration: FormatDuration): Promise<void> {
    const lang = this.translate.getCurrentLang() ?? 'fr';
    const text = [
      // Le jour de jeu (UTC), comme la date de la page : à 0 h 30 à Paris, le défi est encore celui de la veille.
      this.translate.instant('daily.share.header', { score: new Intl.NumberFormat(lang).format(score), date: dayLabel(todayUtc(new Date())) }),
      ...(format === 'long' ? shareLines(tracks, formatDuration, lang) : [shareGrid(tracks)]),
      format === 'long' ? LONG_SHARE_LINK : SHARE_LINK,
    ].join('\n');
    const outcome = await this.sharing.share(text);
    if (outcome === 'shared' || outcome === 'copied') {
      // Un compteur pour l'admin : son échec ne dit rien au joueur.
      this.api.recordShare(format).catch(() => undefined);
    }
    if (outcome !== 'copied' && outcome !== 'failed') return;
    const flag = outcome === 'copied' ? this._copied : this._failed;
    flag.set(true);
    setTimeout(() => flag.set(false), outcome === 'copied' ? 2000 : 3000);
  }
}
