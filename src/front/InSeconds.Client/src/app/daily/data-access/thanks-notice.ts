import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ClipboardService } from '../../core/clipboard/clipboard.service';
import { StoragePort } from '../../core/storage/storage.port';
import { environment } from '../../../environments/environment';
import { roundedGamesPlayed } from '../domain/thanks';
import { DailyApi } from './daily.api';

/** Clé du stockage local, et la valeur qui dit que ce message-là a été vu (un autre message aura une autre valeur). */
export const THANKS_SEEN_KEY = 'inseconds.thanksNoticeSeen';
export const THANKS_NOTICE_ID = 'v2-launch';

/** Issue de « Défie un ami » : partagé par le menu du téléphone, copié, annulé par le joueur, ou rien n'a marché. */
export type ChallengeOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

/**
 * Le message de remerciement du lancement de la v2, montré **une seule fois par navigateur** après une partie : vu (fermé ou non),
 * il est noté dans le stockage local et ne revient plus. Rend aussi le chiffre du message et partage l'invitation « Défie un ami ».
 */
@Injectable()
export class ThanksNotice {
  private readonly storage = inject(StoragePort);
  private readonly api = inject(DailyApi);
  private readonly clipboard = inject(ClipboardService);
  private readonly translate = inject(TranslateService);
  private readonly document = inject(DOCUMENT);

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

  /** Le menu de partage du téléphone s'il existe, sinon le texte copié dans le presse-papier. */
  async challengeFriend(): Promise<ChallengeOutcome> {
    const text = this.translate.instant('daily.thanks.challengeText', { url: environment.appUrl });
    const navigator = this.document.defaultView?.navigator;
    if (navigator?.share) {
      try {
        await navigator.share({ text });
        return 'shared';
      } catch (error) {
        // Le joueur a fermé le menu : rien à copier à sa place.
        if (error instanceof DOMException && error.name === 'AbortError') return 'cancelled';
      }
    }
    return (await this.clipboard.copy(text)) ? 'copied' : 'failed';
  }
}
