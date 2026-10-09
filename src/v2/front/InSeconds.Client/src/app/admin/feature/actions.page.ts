import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { errorMessageKey } from '../../core/errors/error-messages';
import { ErrorMessageComponent } from '../../ui/error-message/error-message.component';
import { ActionsStore } from '../data-access/actions.store';
import { ActionCooldownComponent } from '../ui/action-cooldown.component';
import { ActionGenerateComponent } from '../ui/action-generate.component';
import { ActionJobsLinkComponent } from '../ui/action-jobs-link.component';
import { ActionRefreshPreviewsComponent } from '../ui/action-refresh-previews.component';
import { WeeklyStoryComponent } from './weekly-story.component';

/**
 * `/admin/actions` : générer le défi du jour, re-vérifier les extraits (deux tâches suivies
 * jusqu'à leur résultat), régler le délai de réutilisation des morceaux, ouvrir le tableau de bord
 * des tâches planifiées, et préparer les stories hebdo.
 */
@Component({
  selector: 'app-admin-actions-page',
  imports: [
    ErrorMessageComponent, ActionGenerateComponent, ActionRefreshPreviewsComponent, ActionCooldownComponent,
    ActionJobsLinkComponent, WeeklyStoryComponent,
  ],
  providers: [ActionsStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex w-full min-w-0 justify-center' },
  template: `
    <section class="rounded-xl p-6 flex flex-col gap-4 w-full max-w-2xl" style="background:var(--bg-surface)" data-testid="admin-actions-page">
      <app-action-generate [phase]="store.generatePhase()" [outcome]="store.generateOutcome()" (generate)="store.generateToday()" />
      <div style="border-top:1px solid var(--border-medium)"></div>
      <app-action-refresh-previews [phase]="store.refreshPhase()" [report]="report()" [failed]="store.refreshResult()?.kind === 'error'"
        (refresh)="store.refreshPreviews()" />
      <div style="border-top:1px solid var(--border-medium)"></div>
      @if (loadError(); as error) {
        <app-error-message [messageKey]="error.key" [traceId]="error.traceId" />
      }
      <app-action-cooldown [days]="store.cooldownDays()" [status]="store.cooldownSave()" (saveDays)="store.saveCooldown($event)" />
      <div style="border-top:1px solid var(--border-medium)"></div>
      <app-action-jobs-link [url]="store.jobsDashboardUrl" />
      <div style="border-top:1px solid var(--border-medium)"></div>
      <app-weekly-story />
    </section>
  `,
})
export class ActionsPage {
  protected readonly store = inject(ActionsStore);

  protected readonly report = computed(() => {
    const result = this.store.refreshResult();
    return result?.kind === 'report' ? result.report : null;
  });

  protected readonly loadError = computed(() => {
    const error = this.store.error();
    return error ? { key: errorMessageKey(error.code), traceId: error.traceId } : null;
  });

  constructor() {
    void this.store.load();
  }
}
