import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminPoolService } from '../../services/admin-pool.service';
import { DeleteTrackModalComponent } from '../delete-track-modal/delete-track-modal.component';
import { AddTrackModalComponent } from '../add-track-modal/add-track-modal.component';

@Component({
  selector: 'app-pool-tab',
  imports: [TranslatePipe, DeleteTrackModalComponent, AddTrackModalComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pool-tab.component.html',
})
export class PoolTabComponent {
  protected readonly pool = inject(AdminPoolService);
}
