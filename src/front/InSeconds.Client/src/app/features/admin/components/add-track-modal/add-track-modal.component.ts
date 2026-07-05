import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminPoolService } from '../../services/admin-pool.service';

@Component({
  selector: 'app-add-track-modal',
  imports: [FormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './add-track-modal.component.html',
})
export class AddTrackModalComponent {
  protected readonly pool = inject(AdminPoolService);
}
