import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { SHARE_LINK, ShareOutcome, ShareService } from '../../core/share/share.service';
import { StoragePort } from '../../core/storage/storage.port';
import { roundedGamesPlayed } from '../domain/thanks';
import { DailyApi } from './daily.api';

/** Clé du stockage local, et la valeur qui dit que ce message-là a été vu (un autre message aura une autre valeur). */
export const THANKS_SEEN_KEY = 'inseconds.thanksNoticeSeen';
export const THANKS_NOTICE_ID = 'v2-launch';

/**
 * Le message de remerciement du lancement de la v2, montré **une seule fois par navigateur** après une partie : vu (fermé ou non),
 * il est noté dans le stockage local et ne revient plus. Rend aussi le chiffre du message et partage l'invitation « Défie un ami ».
 */
@Injectable()
export class ThanksNotice {
  private readonly storage = inject(StoragePort);
  private readonly api = inject(DailyApi);
  private readonly sharing = inject(ShareService);
  private readonly translate = inject(TranslateService);

  /** Le message n'a pas encore été montré dans ce navigateur. */
  isDue(): boolean {
    return this.storage.get(THANKS_SEEN_KEY) !== THANKS_NOTICE_ID;
  }

  /** Noté dès l'ouverture : un rechargement ou un onglet fermé sans répondre ne le fait pas revenir. */
  markSeen(): void {
    this.storage.set(THANKS_SEEN_KEY, THANKS_NOTICE_ID);
  }

  /** Le nombre de parties arrondi à la dizaine inférieure ; `null` (message sans chiffre) sous dix parties ou si l'API ne répond pas. */
  async gamesPlayed(): Promise<number | null> {
    try {
      return roundedGamesPlayed(await this.api.gamesPlayed());
    } catch {
      return null;
    }
  }

  /** « Défie un ami » : le menu de partage du téléphone, sinon le texte copié dans le presse-papier (`ShareService`). */
  challengeFriend(): Promise<ShareOutcome> {
    return this.sharing.share(this.translate.instant('daily.thanks.challengeText', { url: SHARE_LINK }));
  }
}
