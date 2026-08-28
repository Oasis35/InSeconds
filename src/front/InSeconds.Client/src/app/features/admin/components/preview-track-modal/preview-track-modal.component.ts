import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminPoolService } from '../../services/admin-pool.service';

@Component({
  selector: 'app-preview-track-modal',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './preview-track-modal.component.html',
})
export class PreviewTrackModalComponent {
  protected readonly pool = inject(AdminPoolService);
}
