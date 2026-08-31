import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { PlayerSessionService } from '../../core/services/player-session.service';
import { ClipboardService } from '../../core/services/clipboard.service';

@Component({
  selector: 'app-browser-id',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './browser-id.component.html',
})
export class BrowserIdComponent {
  protected readonly identity = inject(PlayerSessionService);
  private readonly clipboard = inject(ClipboardService);

  protected readonly copied = signal(false);

  constructor() {
    // PlayerSessionService.load() (app initializer) est en mode peek — ne crée jamais de
    // Player. L'admin doit voir un ID navigateur même s'il ne joue jamais : on force la
    // création ici si nécessaire.
    this.identity.ensureCreated();
  }

  protected copy(id: string): void {
    this.clipboard.copy(id).then(ok => {
      if (!ok) return;
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    });
  }
}
