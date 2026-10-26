import { Injectable, inject, signal } from '@angular/core';
import { TranslateService } from '@ngx-translate/core';
import { ClipboardService } from '../../core/clipboard/clipboard.service';
import { environment } from '../../../environments/environment';

/** L'adresse d'une playlist (`/runs/<code>`), celle que les amis ouvrent. */
export const playlistUrl = (code: string): string => `${environment.appUrl}/runs/${code}`;

/** Le partage d'une playlist : une phrase et son lien dans le presse-papier, et l'état du bouton (copié, échec) pour quelques secondes, comme au Daily. */
@Injectable()
export class RunShare {
  private readonly clipboard = inject(ClipboardService);
  private readonly translate = inject(TranslateService);

  private readonly _copied = signal(false);
  private readonly _failed = signal(false);
  readonly copied = this._copied.asReadonly();
  readonly failed = this._failed.asReadonly();

  async share(code: string): Promise<void> {
    const text = [this.translate.instant('runs.share.text'), playlistUrl(code)].join('\n');
    const ok = await this.clipboard.copy(text);
    const flag = ok ? this._copied : this._failed;
    flag.set(true);
    setTimeout(() => flag.set(false), ok ? 2000 : 3000);
  }
}
