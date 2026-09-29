import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { RouterLink, RouterOutlet } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { BUILD_TIME } from '../../core/build-info';
import { AdminHttpService } from './services/admin-http.service';
import { AdminStateService } from './services/admin-state.service';
import { AdminApiService } from './services/admin-api.service';
import { AdminStatsService } from './services/admin-stats.service';
import { AdminPoolService } from './services/admin-pool.service';
import { AdminActionsService } from './services/admin-actions.service';
import { PoolAudioPreviewService } from './services/pool-audio-preview.service';
import { AdminWeeklyStoryService } from './services/admin-weekly-story.service';
import { AdminLoginComponent } from './components/admin-login/admin-login.component';
import { DecorBackgroundComponent } from '../../shared/decor-background/decor-background.component';
import { BrowserIdComponent } from '../../shared/browser-id/browser-id.component';

@Component({
  selector: 'app-admin',
  imports: [
    DatePipe, TranslatePipe, RouterLink, RouterOutlet,
    AdminLoginComponent, DecorBackgroundComponent, BrowserIdComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  providers: [
    AdminHttpService, AdminStateService, AdminApiService, AdminStatsService,
    AdminPoolService, AdminActionsService, PoolAudioPreviewService, AdminWeeklyStoryService,
  ],
  templateUrl: './admin.component.html',
})
export class AdminComponent {
  protected readonly api = inject(AdminApiService);
  protected readonly state = inject(AdminStateService);
  protected readonly stats = inject(AdminStatsService);
  protected readonly pool = inject(AdminPoolService);

  protected readonly buildTime = BUILD_TIME;

  constructor() {
    this.api.checkAuth();
  }

  logout(): void {
    this.api.logout();
  }
}
