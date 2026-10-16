import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/** Bloc « Tâches planifiées » : lien vers le tableau de bord Hangfire (réservé aux admins par l'API). */
@Component({
  selector: 'app-action-jobs-link',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-2">
      <h2 class="text-xs font-semibold uppercase tracking-wide" style="color:var(--text-muted)">{{ 'admin.actions.jobs.title' | translate }}</h2>
      <p class="text-xs" style="color:var(--text-muted)">{{ 'admin.actions.jobs.hint' | translate }}</p>
      <a [href]="url()" target="_blank" rel="noopener" data-testid="jobs-dashboard-link"
        class="text-sm font-medium underline self-start" style="color:var(--text-accent)">
        {{ 'admin.actions.jobs.link' | translate }} ↗
      </a>
    </div>
  `,
})
export class ActionJobsLinkComponent {
  readonly url = input.required<string>();
}
