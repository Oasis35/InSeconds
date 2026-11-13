import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, inject, viewChildren } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ErrorReportingService } from '../../../core/errors/error-reporting.service';
import { AccountLinkComponent } from '../../../core/shell/account-link/account-link.component';
import { InstagramLinkComponent } from '../../../core/shell/instagram-link/instagram-link.component';
import { BrandComponent } from '../../../ui/brand/brand.component';
import { DecorBackgroundComponent } from '../../../ui/decor-background/decor-background.component';
import { pop } from '../../../ui/motion/motion';
import { RunHitsStore } from '../../data-access/run-hits.store';
import { hitPercent } from '../../domain/run-hits';
import { RunStatusScreenComponent } from '../../ui/run-status-screen/run-status-screen.component';

/**
 * Les Hits du joueur (`/setlist/hits`) : ce qu'il a obtenu en jouant, à sa couleur, et ce qui reste à obtenir, avec une barre pour ceux qui se
 * comptent. Un Hit obtenu depuis la dernière visite arrive avec un petit temps fort. Ce sont ses propres parties : pas d'accès à vérifier.
 */
@Component({
  selector: 'app-run-hits-page',
  imports: [TranslatePipe, RouterLink, DecorBackgroundComponent, BrandComponent, AccountLinkComponent, InstagramLinkComponent, RunStatusScreenComponent],
  providers: [RunHitsStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './run-hits.page.html',
})
export class RunHitsPage {
  protected readonly store = inject(RunHitsStore);
  protected readonly errorReporting = inject(ErrorReportingService);
  private readonly freshRows = viewChildren<ElementRef<HTMLElement>>('freshRow');

  protected readonly rows = computed(() => {
    const fresh = this.store.fresh();
    return this.store.hits().map(hit => ({
      key: hit.key,
      nameKey: `runs.hits.names.${hit.key}`,
      earned: hit.earned,
      fresh: fresh.includes(hit.key),
      progress: hit.earned ? null : hit.progress,
      target: hit.target,
      percent: hit.earned ? null : hitPercent(hit),
    }));
  });

  constructor() {
    void this.store.load(true);
    afterRenderEffect(() => this.freshRows().forEach(row => pop(row.nativeElement)));
  }

  protected retry(): void {
    void this.store.load(true);
  }
}
