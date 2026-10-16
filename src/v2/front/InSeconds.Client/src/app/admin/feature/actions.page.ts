import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { errorMessageKey } from '../../core/errors/error-messages';
import { ErrorMessageComponent } from '../../ui/error-message/error-message.component';
import { ActionsStore } from '../data-access/actions.store';
import { ActionCooldownComponent } from '../ui/action-cooldown.component';
import { challengeWitness, previewsWitness } from '../domain/actions';
import { GENERATE_CHALLENGE_JOB, REFRESH_PREVIEWS_JOB } from '../domain/job';
import { ActionJobsLinkComponent } from '../ui/action-jobs-link.component';
import { JobWitnessComponent } from '../ui/job-witness.component';
import { WeeklyStoryComponent } from './weekly-story.component';

/**
 * `/admin/actions` : le dernier passage de la génération du défi du jour et du contrôle des extraits (témoins en
 * lecture seule, lus à l'ouverture), le lien vers le tableau de bord des tâches planifiées (où les lancer à la main),
 * le délai de réutilisation des morceaux, et les stories hebdo.
 */
@Component({
  selector: 'app-admin-actions-page',
  imports: [
    ErrorMessageComponent, JobWitnessComponent, ActionCooldownComponent, ActionJobsLinkComponent, WeeklyStoryComponent,
  ],
  providers: [ActionsStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex w-full min-w-0 justify-center' },
  template: `
    <section class="rounded-xl p-6 flex flex-col gap-4 w-full max-w-2xl" style="background:var(--bg-surface)" data-testid="admin-actions-page">
      <app-job-witness data-testid="challenge-witness" titleKey="admin.actions.challengeOfDay" [witness]="challenge()"
        [nextRunAt]="challengeRun()?.nextRunAt ?? null" [failed]="store.lastRunsFailed()" />
      <app-job-witness data-testid="previews-witness" titleKey="admin.actions.previews" [witness]="previews()"
        [nextRunAt]="previewsRun()?.nextRunAt ?? null" [failed]="store.lastRunsFailed()" />
      <app-action-jobs-link [url]="store.jobsDashboardUrl" />
      <div style="border-top:1px solid var(--border-medium)"></div>
      @if (loadError(); as error) {
        <app-error-message [messageKey]="error.key" [traceId]="error.traceId" />
      }
      <app-action-cooldown [days]="store.cooldownDays()" [status]="store.cooldownSave()" (saveDays)="store.saveCooldown($event)" />
      <div style="border-top:1px solid var(--border-medium)"></div>
      <app-weekly-story />
    </section>
  `,
})
export class ActionsPage {
  protected readonly store = inject(ActionsStore);

  protected readonly challengeRun = computed(() => this.store.lastRuns()?.find(run => run.id === GENERATE_CHALLENGE_JOB));
  protected readonly previewsRun = computed(() => this.store.lastRuns()?.find(run => run.id === REFRESH_PREVIEWS_JOB));

  /** `null` tant que les derniers passages ne sont pas lus (rien n'est affiché sous le titre). */
  protected readonly challenge = computed(() => (this.store.lastRuns() ? challengeWitness(this.challengeRun()) : null));
  protected readonly previews = computed(() => (this.store.lastRuns() ? previewsWitness(this.previewsRun()) : null));

  protected readonly loadError = computed(() => {
    const error = this.store.error();
    return error ? { key: errorMessageKey(error.code), traceId: error.traceId } : null;
  });

  constructor() {
    void this.store.load();
  }
}
