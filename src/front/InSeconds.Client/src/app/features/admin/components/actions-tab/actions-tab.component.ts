import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminActionsService } from '../../services/admin-actions.service';
import { WeeklyStoryComponent } from '../weekly-story/weekly-story.component';
import { SettingsService } from '../../../../core/services/settings.service';

@Component({
  selector: 'app-actions-tab',
  imports: [TranslatePipe, WeeklyStoryComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './actions-tab.component.html',
})
export class ActionsTabComponent {
  protected readonly actions = inject(AdminActionsService);
  protected readonly settings = inject(SettingsService);
}
