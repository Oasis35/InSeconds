import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminPoolService, PoolSortColumn } from '../../services/admin-pool.service';
import { DeleteTrackModalComponent } from '../delete-track-modal/delete-track-modal.component';
import { AddTrackModalComponent } from '../add-track-modal/add-track-modal.component';
import { PreviewTrackModalComponent } from '../preview-track-modal/preview-track-modal.component';

interface PoolSortableColumn {
  column: PoolSortColumn;
  labelKey: string;
  widthClass?: string;
}

@Component({
  selector: 'app-pool-tab',
  imports: [TranslatePipe, DeleteTrackModalComponent, AddTrackModalComponent, PreviewTrackModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pool-tab.component.html',
})
export class PoolTabComponent {
  protected readonly pool = inject(AdminPoolService);

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
