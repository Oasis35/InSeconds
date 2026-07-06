import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminActionsService } from '../../services/admin-actions.service';

@Component({
  selector: 'app-actions-tab',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './actions-tab.component.html',
})
export class ActionsTabComponent {
  protected readonly actions = inject(AdminActionsService);
}
