import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ModalComponent } from '../../../../shared/modal/modal.component';
import { AdminPoolService } from '../../services/admin-pool.service';

@Component({
  selector: 'app-delete-track-modal',
  imports: [ModalComponent, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './delete-track-modal.component.html',
})
export class DeleteTrackModalComponent {
  protected readonly pool = inject(AdminPoolService);
}
