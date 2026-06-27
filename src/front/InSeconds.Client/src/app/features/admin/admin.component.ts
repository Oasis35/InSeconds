import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { BUILD_TIME } from '../../core/build-info';
import { AdminTab } from './admin.models';
import { AdminApiService } from './services/admin-api.service';
import { AdminStatsService } from './services/admin-stats.service';
import { AdminPoolService } from './services/admin-pool.service';
import { AdminActionsService } from './services/admin-actions.service';
import { AdminLoginComponent } from './components/admin-login/admin-login.component';
import { DashboardTabComponent } from './components/dashboard-tab/dashboard-tab.component';
import { PoolTabComponent } from './components/pool-tab/pool-tab.component';
import { ChallengesTabComponent } from './components/challenges-tab/challenges-tab.component';
import { ActionsTabComponent } from './components/actions-tab/actions-tab.component';

@Component({
  selector: 'app-admin',
  imports: [
    DatePipe, TranslatePipe,
    AdminLoginComponent, DashboardTabComponent, PoolTabComponent,
    ChallengesTabComponent, ActionsTabComponent,
  ],
  changeDetection: ChangeDetectionStrategy.Eager,
  providers: [AdminApiService, AdminStatsService, AdminPoolService, AdminActionsService],
  templateUrl: './admin.component.html',
})
export class AdminComponent {
  protected readonly api = inject(AdminApiService);
  protected readonly stats = inject(AdminStatsService);
  protected readonly pool = inject(AdminPoolService);

  protected readonly buildTime = BUILD_TIME;
  protected readonly activeTab = signal<AdminTab>('dashboard');

  constructor() {
    this.api.checkAuth();
  }

  logout(): void {
    this.api.logout();
  }
}
