import { Component, inject, effect, untracked, ChangeDetectionStrategy } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminPoolService, PoolSortColumn } from '../../services/admin-pool.service';
import { DeleteTrackModalComponent } from '../delete-track-modal/delete-track-modal.component';
import { EditTrackModalComponent } from '../edit-track-modal/edit-track-modal.component';
import { PoolSearchPanelComponent } from '../pool-search-panel/pool-search-panel.component';
import { PreviewTrackModalComponent } from '../preview-track-modal/preview-track-modal.component';

interface PoolSortableColumn {
  column: PoolSortColumn;
  labelKey: string;
  widthClass?: string;
}

@Component({
  selector: 'app-pool-tab',
  imports: [TranslatePipe, DeleteTrackModalComponent, EditTrackModalComponent, PoolSearchPanelComponent, PreviewTrackModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pool-tab.component.html',
})
export class PoolTabComponent {
  protected readonly pool = inject(AdminPoolService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  constructor() {
    // La page de la grille vit dans l'adresse (`/admin/pool?page=3`, numérotée à partir de 1) :
    // un F5 ou un lien partagé rouvre la même page.
    const page = Number(this.route.snapshot.queryParamMap.get('page'));
    if (Number.isInteger(page) && page >= 1) this.pool.setPage(page - 1);

    // Synchronisation page → adresse, seulement une fois le pool chargé (avant, la grille n'a
    // qu'une page et la page reprise de l'adresse serait effacée). replaceUrl : le bouton
    // « précédent » du navigateur ne revient pas page par page.
    effect(() => {
      if (!this.pool.poolTracksLoaded()) return;
      const current = this.pool.allTracksPage() + 1;
      untracked(() => this.router.navigate([], {
        relativeTo: this.route,
        queryParams: { page: current > 1 ? current : null },
        queryParamsHandling: 'merge',
        replaceUrl: true,
      }));
    });
  }

  protected readonly sortableColumns: PoolSortableColumn[] = [
    { column: 'artist', labelKey: 'admin.pool.colArtist' },
    { column: 'title', labelKey: 'admin.pool.colTitle' },
    { column: 'preview', labelKey: 'admin.pool.colPreview', widthClass: 'w-28' },
    { column: 'status', labelKey: 'admin.pool.colStatus', widthClass: 'w-24' },
    { column: 'lastUsedDate', labelKey: 'admin.pool.colLastUsed', widthClass: 'w-28' },
    { column: 'unlockDate', labelKey: 'admin.pool.colUnlockDate', widthClass: 'w-28' },
    { column: 'usageCount', labelKey: 'admin.pool.colUsageCount', widthClass: 'w-20' },
  ];
}
