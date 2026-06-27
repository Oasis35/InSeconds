import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminStatsService } from '../../services/admin-stats.service';

@Component({
  selector: 'app-dashboard-tab',
  imports: [DecimalPipe, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './dashboard-tab.component.html',
})
export class DashboardTabComponent {
  protected readonly stats = inject(AdminStatsService);
}
