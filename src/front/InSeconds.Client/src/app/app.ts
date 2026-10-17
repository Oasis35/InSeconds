import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';

import { environment } from '../environments/environment';
import { HealthService } from './core/health/health.service';
import { consumeLegacyUrlFlag } from './core/shell/legacy-url';
import { LegacyUrlNoticeComponent } from './core/shell/legacy-url-notice/legacy-url-notice.component';
import { ServiceDownComponent } from './core/shell/service-down/service-down.component';
import { UpdatePromptComponent } from './core/shell/update-prompt/update-prompt.component';
import { EnvBannerComponent } from './ui/env-banner/env-banner.component';
import { ModalService } from './ui/modal/modal.service';
import { ToastHostComponent } from './ui/toast/toast-host.component';

/** Drapeaux posés par les tests E2E (`addInitScript`), repris de la v1. */
interface E2EFlags {
  /** Coupe les animations (sous `page.clock` figée, une animation en cours peut masquer un élément). */
  __disableAnimations?: boolean;
  /** Coupe la sonde `/health` (les sauts d'horloge cumuleraient des échecs → faux overlay). */
  __disableHealthPolling?: boolean;
}

@Component({
  selector: 'app-root',
  imports: [
    RouterOutlet, EnvBannerComponent, ToastHostComponent, UpdatePromptComponent, ServiceDownComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './app.html',
})
export class App {
  protected readonly environmentName = environment.name;
  protected readonly health = inject(HealthService);

  constructor() {
    const flags = window as E2EFlags;
    if (flags.__disableAnimations === true) document.documentElement.classList.add('no-anim');
    if (flags.__disableHealthPolling !== true) this.health.start();
    if (consumeLegacyUrlFlag(window.location, window.history)) {
      inject(ModalService).open(LegacyUrlNoticeComponent, { maxWidth: '28rem' });
    }
  }
}
