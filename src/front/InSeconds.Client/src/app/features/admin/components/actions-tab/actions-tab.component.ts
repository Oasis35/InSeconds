import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminActionsService } from '../../services/admin-actions.service';
import { SettingsService } from '../../../../core/services/settings.service';

@Component({
  selector: 'app-actions-tab',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './actions-tab.component.html',
})
export class ActionsTabComponent {
  protected readonly actions = inject(AdminActionsService);
  protected readonly settings = inject(SettingsService);

  protected testEmail = '';
}
