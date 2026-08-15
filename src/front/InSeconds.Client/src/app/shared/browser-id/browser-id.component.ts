import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { PlayerIdentityService } from '../../core/services/player-identity.service';
import { ClipboardService } from '../../core/services/clipboard.service';

@Component({
  selector: 'app-browser-id',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './browser-id.component.html',
})
export class BrowserIdComponent {
  protected readonly identity = inject(PlayerIdentityService);
  private readonly clipboard = inject(ClipboardService);

  protected readonly copied = signal(false);

  protected copy(id: string): void {
    this.clipboard.copy(id).then(ok => {
      if (!ok) return;
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }
}
