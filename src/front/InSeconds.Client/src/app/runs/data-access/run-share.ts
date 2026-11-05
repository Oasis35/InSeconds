import { Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ShareService } from '../../core/share/share.service';
import { environment } from '../../../environments/environment';

/** L'adresse d'une playlist (`/runs/<code>`), celle que les amis ouvrent, marquée `utm_source=share` comme le partage du score. */
export const playlistUrl = (code: string): string => `${environment.appUrl}/runs/${code}?utm_source=share`;

/**
 * Le partage d'une playlist : une phrase et son lien, par le menu de partage du téléphone ou sinon dans le presse-papier, et l'état du bouton (copié,
 * échec) pour quelques secondes, comme au Daily. Un partage natif ou un menu fermé ne change rien au bouton.
 */
@Injectable()
export class RunShare {
  private readonly sharing = inject(ShareService);
  private readonly translate = inject(TranslateService);

  private readonly _copied = signal(false);
  private readonly _failed = signal(false);
  readonly copied = this._copied.asReadonly();
  readonly failed = this._failed.asReadonly();

  async share(code: string): Promise<void> {
    const text = [this.translate.instant('runs.share.text'), playlistUrl(code)].join('\n');
    const outcome = await this.sharing.share(text);
    if (outcome !== 'copied' && outcome !== 'failed') return;
    const flag = outcome === 'copied' ? this._copied : this._failed;
    flag.set(true);
    setTimeout(() => flag.set(false), outcome === 'copied' ? 2000 : 3000);
  }
}
