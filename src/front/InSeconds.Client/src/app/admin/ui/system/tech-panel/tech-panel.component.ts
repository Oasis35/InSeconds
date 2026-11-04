import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import {
  BackupTone, CatalogueHealth, CiRun, DeploymentVerdict, JobTone, NextChallengeState, NightlyJob, shortCommit,
} from '../../../domain/system';

const JOB_ICON: Record<JobTone, { icon: string; color: string }> = {
  ok: { icon: '✓', color: 'var(--color-success)' },
  warn: { icon: '!', color: 'var(--color-warn)' },
  error: { icon: '✗', color: 'var(--text-error)' },
  running: { icon: '…', color: 'var(--text-body)' },
  none: { icon: '·', color: 'var(--text-faint)' },
};

const VERDICT_COLOR: Record<DeploymentVerdict, string> = {
  aligned: 'var(--color-success)',
  same: 'var(--color-success)',
  deploying: 'var(--text-light)',
  pending: 'var(--color-warn)',
  mismatch: 'var(--text-error)',
  unknown: 'var(--text-muted)',
};

const CI_COLOR: Record<CiRun['state'] | 'none', string> = {
  success: 'var(--color-success)',
  failure: 'var(--text-error)',
  running: 'var(--color-warn)',
  unknown: 'var(--text-muted)',
  none: 'var(--text-muted)',
};

/** Une ligne de la CI : la branche, son libellé (`prod`, `staging`), le dernier passage s'il est connu, et la page des passages. */
export interface CiLine {
  readonly labelKey: string;
  readonly run: CiRun | null;
  readonly url: string;
}

/**
 * Le panneau technique de l'admin, en blocs titrés : Déploiement (la date en grand, les commits du front, de l'API et le dernier de
 * la branche, et le verdict), Santé (API et dernière sauvegarde), Catalogue (morceaux sans extrait, avec le lien vers le pool filtré, et
 * formes d'onde manquantes), Tâches de la nuit (avec le lien vers Hangfire, puis le défi de demain), Intégration continue
 * (prod et staging, avec le lien vers Grafana). Ce que la page projette (l'identifiant du navigateur, la déconnexion) vient à la fin.
 * Barre de gauche sur PC, menu déplié sous l'en-tête sur téléphone : le même contenu.
 */
@Component({
  selector: 'app-tech-panel',
  imports: [DatePipe, RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-4 text-xs" style="color:var(--text-muted)" data-testid="admin-tech-panel">
      <section>
        <h2 class="tech-title">{{ 'admin.system.deployment' | translate }}</h2>
        @if (deployedAt(); as at) {
          <p class="text-base font-semibold" style="color:var(--text-hi)" data-testid="deployed-at">
            {{ 'admin.deployedAt' | translate: { date: (at | date: 'dd/MM/yyyy'), time: (at | date: 'HH:mm') } }}
          </p>
        } @else {
          <p style="color:var(--text-hi)">{{ 'admin.system.localBuild' | translate }}</p>
        }
        <p class="tech-line"><span>{{ 'admin.system.front' | translate }}</span><span class="font-mono" style="color:var(--text-hi)">{{ short(frontCommit()) }}</span></p>
        <p class="tech-line"><span>{{ 'admin.system.api' | translate }}</span><span class="font-mono" style="color:var(--text-hi)">{{ short(apiCommit()) }}</span></p>
        @if (branch(); as name) {
          <p class="tech-line"><span>{{ 'admin.system.branchHead' | translate: { branch: name } }}</span><span class="font-mono" style="color:var(--text-hi)">{{ short(branchHead()) }}</span></p>
        }
        <p class="mt-1" role="status" [style.color]="verdictColor()" data-testid="deployment-verdict">{{ 'admin.system.verdict.' + verdict() | translate }}</p>
      </section>

      <section>
        <h2 class="tech-title">{{ 'admin.system.health' | translate }}</h2>
        <p class="tech-line">
          <span>{{ 'admin.system.api' | translate }}</span>
          <span style="color:var(--text-hi)" data-testid="api-health">
            <span aria-hidden="true" [style.color]="apiDown() ? 'var(--text-error)' : 'var(--color-success)'">●</span>
            @if (apiDown()) { {{ 'admin.system.apiDown' | translate }} } @else if (latencyMs() !== null) { {{ 'admin.system.latency' | translate: { ms: latencyMs() } }} }
          </span>
        </p>
        <p class="tech-line">
          <span>{{ 'admin.system.backup' | translate }}</span>
          <span [style.color]="backup() === 'stale' ? 'var(--text-error)' : 'var(--text-hi)'" data-testid="backup">
            @if (backupAt(); as at) {
              <span aria-hidden="true" [style.color]="backup() === 'stale' ? 'var(--text-error)' : 'var(--color-success)'">{{ backup() === 'stale' ? '✗' : '✓' }}</span>
              {{ at | date: 'dd/MM HH:mm' }} · {{ (backupOffSite() ? 'admin.system.backupOffSite' : 'admin.system.backupLocal') | translate }}
            } @else {
              {{ 'admin.system.noBackup' | translate }}
            }
          </span>
        </p>
      </section>

      @if (catalogue(); as pool) {
        <section data-testid="tech-catalogue">
          <h2 class="tech-title">{{ 'admin.system.catalogue' | translate }}</h2>
          <p class="tech-line">
            <span>{{ 'admin.system.missingPreviews' | translate }}</span>
            @if (pool.missingPreviewCount > 0) {
              <a routerLink="/admin/catalogue" [queryParams]="{ extrait: 'absent' }" class="underline hover:text-(--text-hi)" style="color:var(--color-warn)"
                data-testid="missing-previews">{{ (pool.missingPreviewCount > 1 ? 'admin.system.tracksCount' : 'admin.system.trackCount') | translate: { count: pool.missingPreviewCount } }}</a>
            } @else {
              <span style="color:var(--text-hi)" data-testid="missing-previews"><span aria-hidden="true" style="color:var(--color-success)">✓</span> 0</span>
            }
          </p>
          <p class="tech-line">
            <span>{{ 'admin.system.missingWaveforms' | translate }}</span>
            <span data-testid="missing-waveforms" [style.color]="pool.missingWaveformCount > 0 ? 'var(--color-warn)' : 'var(--text-hi)'">
              @if (pool.missingWaveformCount === 0) { <span aria-hidden="true" style="color:var(--color-success)">✓</span> }
              {{ pool.missingWaveformCount }}
            </span>
          </p>
        </section>
      }

      <section>
        <h2 class="tech-title flex items-center justify-between">{{ 'admin.system.nightlyJobs' | translate }}
          <a [href]="jobsUrl()" class="normal-case font-normal underline hover:text-(--text-hi)" style="color:var(--text-muted)">{{ 'admin.system.hangfire' | translate }}</a>
        </h2>
        @if (jobsFailed()) {
          <p style="color:var(--text-error)">{{ 'admin.system.jobsLoadError' | translate }}</p>
        } @else {
          @for (job of jobs() ?? []; track job.id) {
            <p class="flex items-center gap-1.5 py-0.5" data-testid="nightly-job">
              <span class="font-bold w-3 text-center" aria-hidden="true" [style.color]="jobIcon(job).color">{{ jobIcon(job).icon }}</span>
              <span [style.color]="job.tone === 'error' ? 'var(--text-error)' : 'var(--text-light)'">{{ 'admin.system.jobs.' + job.id | translate }}</span>
              <span class="sr-only">{{ 'admin.system.jobTone.' + job.tone | translate }}</span>
              <span class="ml-auto tabular-nums">{{ job.at ? (job.at | date: 'dd/MM HH:mm') : '-' }}</span>
            </p>
          }
        }
        @if (nextChallenge(); as next) {
          @let ok = next.kind === 'ready';
          <p class="flex items-center gap-1.5 py-0.5 mt-1 pt-1.5" style="border-top:1px solid var(--border-subtle)" data-testid="next-challenge">
            <span class="font-bold w-3 text-center" aria-hidden="true" [style.color]="ok ? 'var(--color-success)' : 'var(--text-error)'">{{ ok ? '✓' : '✗' }}</span>
            <span [style.color]="ok ? 'var(--text-light)' : 'var(--text-error)'">{{ (next.kind === 'retrying' ? 'admin.system.todayChallenge' : 'admin.system.nextChallenge') | translate }}</span>
            <span class="ml-auto text-right" [style.color]="ok ? null : 'var(--text-error)'">
              @switch (next.kind) {
                @case ('ready') {
                  {{ (next.generated ? 'admin.system.nextChallengeGenerated' : 'admin.system.nextChallengeReady') | translate: { count: next.eligibleCount } }}
                }
                @case ('insufficient') {
                  {{ 'admin.system.nextChallengeInsufficient' | translate: { count: next.eligibleCount, required: next.requiredCount } }}
                }
                @case ('retrying') {
                  @if (next.retryAt; as at) {
                    {{ 'admin.system.nextChallengeRetryAt' | translate: { time: (at | date: 'HH:mm') } }}
                  } @else {
                    {{ 'admin.system.nextChallengeFailed' | translate }}
                  }
                }
              }
            </span>
          </p>
        }
      </section>

      <section>
        <h2 class="tech-title flex items-center justify-between">{{ 'admin.system.ci' | translate }}
          <a [href]="grafanaUrl()" target="_blank" rel="noopener" class="normal-case font-normal underline hover:text-(--text-hi)" style="color:var(--text-muted)">{{ 'admin.system.grafana' | translate }}</a>
        </h2>
        @for (line of ci(); track line.labelKey) {
          <a [href]="line.run?.url ?? line.url" target="_blank" rel="noopener" class="tech-line hover:text-(--text-hi)" data-testid="ci-line">
            <span>{{ line.labelKey | translate }}</span>
            <span [style.color]="ciColor(line)">
              <span aria-hidden="true">●</span> {{ 'admin.system.ciState.' + (line.run?.state ?? 'none') | translate }}
            </span>
          </a>
        }
      </section>

      <ng-content />
    </div>
  `,
  styles: `
    .tech-title { font-size: 12px; font-weight: 600; margin-bottom: 0.375rem; color: var(--text-faint); }
    .tech-line { display: flex; align-items: center; justify-content: space-between; gap: 0.5rem; padding: 0.125rem 0; }
  `,
})
export class TechPanelComponent {
  readonly deployedAt = input<string | null>(null);
  readonly frontCommit = input<string | null>(null);
  readonly apiCommit = input<string | null>(null);
  /** La branche que cet environnement déploie, et son dernier commit chez GitHub. */
  readonly branch = input<string | null>(null);
  readonly branchHead = input<string | null>(null);
  readonly verdict = input<DeploymentVerdict>('unknown');
  readonly apiDown = input(false);
  readonly latencyMs = input<number | null>(null);
  readonly backup = input<BackupTone>('none');
  readonly backupAt = input<string | null>(null);
  readonly backupOffSite = input<boolean | null>(null);
  /** `null` tant que les tâches ne sont pas lues. */
  readonly jobs = input<readonly NightlyJob[] | null>(null);
  readonly jobsFailed = input(false);
  /** Le pool (sans extrait, sans forme d'onde) ; rien d'affiché tant que ce n'est pas lu. */
  readonly catalogue = input<CatalogueHealth | null>(null);
  /** La ligne « Défi de demain », sous les tâches ; rien d'affiché tant que ce n'est pas lu. */
  readonly nextChallenge = input<NextChallengeState | null>(null);
  readonly ci = input<readonly CiLine[]>([]);
  readonly jobsUrl = input.required<string>();
  readonly grafanaUrl = input.required<string>();

  protected readonly verdictColor = computed(() => VERDICT_COLOR[this.verdict()]);

  protected short(sha: string | null): string {
    return shortCommit(sha) ?? '-';
  }

  protected jobIcon(job: NightlyJob): { icon: string; color: string } {
    return JOB_ICON[job.tone];
  }

  protected ciColor(line: CiLine): string {
    return CI_COLOR[line.run?.state ?? 'none'];
  }
}
