import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminStatsService } from '../../services/admin-stats.service';

@Component({
  selector: 'app-challenges-tab',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './challenges-tab.component.html',
})
export class ChallengesTabComponent {
  protected readonly stats = inject(AdminStatsService);
}
