import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminStatsService } from '../../services/admin-stats.service';

@Component({
  selector: 'app-challenges-tab',
  imports: [DecimalPipe, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './challenges-tab.component.html',
})
export class ChallengesTabComponent {
  protected readonly stats = inject(AdminStatsService);
}
