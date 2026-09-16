import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminPoolService } from '../../services/admin-pool.service';
import { PoolAudioPreviewService } from '../../services/pool-audio-preview.service';

@Component({
  selector: 'app-pool-search-panel',
  imports: [FormsModule, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pool-search-panel.component.html',
})
export class PoolSearchPanelComponent {
  protected readonly pool = inject(AdminPoolService);
  protected readonly audioPreview = inject(PoolAudioPreviewService);
}
