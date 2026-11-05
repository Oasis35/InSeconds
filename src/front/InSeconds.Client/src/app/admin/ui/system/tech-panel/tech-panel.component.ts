import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import {
  BackupFailure, BackupTone, CatalogueHealth, CiRun, DeploymentVerdict, JobTone, NextChallengeState, NightlyJob, shortCommit,
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

const CI_ICON: Record<CiRun['state'] | 'none', string> = {
  success: '✓',
  failure: '✗',
  running: '…',
  unknown: '·',
  none: '·',
};

/** Le déploiement est en retard ou désaligné : les commits se montrent d'office, pour voir lequel est en cause. */
const VERDICTS_SHOWING_COMMITS: ReadonlySet<DeploymentVerdict> = new Set(['pending', 'mismatch']);

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
 * Le panneau technique de l'admin, en blocs titrés et compacts (une information par ligne, l'indicateur à gauche comme pour les
 * tâches) : Déploiement (la date, le verdict en couleur ; les commits du front, de l'API et le dernier de la branche se déplient au
 * clic, d'office quand le déploiement est en retard ou désaligné), Santé (API, dernière sauvegarde, contrôle de restauration),
 * Catalogue (morceaux sans extrait, avec le lien vers les morceaux filtrés, et formes d'onde manquantes), Tâches de la nuit (avec le
 * lien vers Hangfire, puis le défi de demain), Intégration continue (prod et staging côte à côte, avec le lien vers Grafana). Ce que
 * la page projette (l'identifiant du navigateur, la déconnexion) vient à la fin. Colonne de gauche sur PC, menu déplié sous
 * l'en-tête sur téléphone : le même contenu.
 */
@Component({
  selector: 'app-tech-panel',
  imports: [DatePipe, RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-3 text-xs" style="color:var(--text-muted)" data-testid="admin-tech-panel">
      <section>
        <h2 class="tech-title">{{ 'admin.system.deployment' | translate }}</h2>
        @if (deployedAt(); as at) {
          <p class="text-sm font-semibold whitespace-nowrap" style="color:var(--text-hi)" data-testid="deployed-at">
            {{ 'admin.deployedAt' | translate: { date: (at | date: 'dd/MM'), time: (at | date: 'HH:mm') } }}
          </p>
        } @else {
          <p style="color:var(--text-hi)">{{ 'admin.system.localBuild' | translate }}</p>
        }
        <!-- Le verdict seul ; les commits se déplient au clic (dépliés d'office quand le déploiement est en retard ou désaligné). -->
        <button type="button" (click)="commitsToggled.set(!commitsOpen())" [attr.aria-expanded]="commitsOpen()" aria-controls="tech-commits"
          class="mt-0.5 py-1.5 -my-1.5 text-left hover:opacity-80" [style.color]="verdictColor()" data-testid="deployment-verdict">
          <span role="status">{{ 'admin.system.verdict.' + verdict() | translate }}</span>
          <span aria-hidden="true" style="color:var(--text-muted)"> {{ commitsOpen() ? '▴' : '▾' }}</span>
        </button>
        @if (commitsOpen()) {
          <div id="tech-commits" class="mt-0.5" data-testid="deployment-commits">
            <p class="tech-row"><span class="tech-label">{{ 'admin.system.front' | translate }}</span><span class="tech-value font-mono" style="color:var(--text-hi)">{{ short(frontCommit()) }}</span></p>
            <p class="tech-row"><span class="tech-label">{{ 'admin.system.api' | translate }}</span><span class="tech-value font-mono" style="color:var(--text-hi)">{{ short(apiCommit()) }}</span></p>
            @if (branch(); as name) {
              <p class="tech-row"><span class="tech-label">{{ 'admin.system.branchHead' | translate: { branch: name } }}</span><span class="tech-value font-mono" style="color:var(--text-hi)">{{ short(branchHead()) }}</span></p>
            }
          </div>
        }
      </section>

      <!-- Une ligne par information, comme les tâches : l'indicateur à gauche, le libellé, la valeur à droite. -->
      <section>
        <h2 class="tech-title">{{ 'admin.system.health' | translate }}</h2>
        <p class="tech-row">
          <span class="tech-icon" aria-hidden="true" [style.color]="apiDown() ? 'var(--text-error)' : 'var(--color-success)'">{{ apiDown() ? '✗' : '✓' }}</span>
          <span class="tech-label">{{ 'admin.system.api' | translate }}</span>
          <span class="tech-value" [style.color]="apiDown() ? 'var(--text-error)' : null" data-testid="api-health">
            @if (apiDown()) { {{ 'admin.system.apiDown' | translate }} } @else if (latencyMs() !== null) { {{ 'admin.system.latency' | translate: { ms: latencyMs() } }} }
          </span>
        </p>
        <p class="tech-row">
          <span class="tech-icon" aria-hidden="true" [style.color]="backupIcon(backup(), backupAt()).color">{{ backupIcon(backup(), backupAt()).icon }}</span>
          <span class="tech-label">{{ 'admin.system.backup' | translate }}</span>
          <span class="tech-value" [style.color]="stale(backup()) ? 'var(--text-error)' : null" data-testid="backup">
            @if (backupAt(); as at) { {{ at | date: 'dd/MM HH:mm' }} } @else if (!backupFailure()) { {{ 'admin.system.noBackup' | translate }} }
          </span>
        </p>
        <!-- « Hors site » (copiée sur R2) est la normale : seul son contraire s'affiche. -->
        @if (backupAt() && backupOffSite() === false) {
          <p class="pl-4.5" style="color:var(--color-warn)" data-testid="backup-local">{{ 'admin.system.backupLocal' | translate }}</p>
        }
        @if (backupFailure(); as failure) {
          <p class="pl-4.5 break-words" style="color:var(--text-error)" data-testid="backup-failure">
            {{ 'admin.system.backupFailed' | translate: { at: (failure.at | date: 'dd/MM HH:mm') } }}{{ failure.message ? ' : ' + failure.message : '' }}
          </p>
        }
        <p class="tech-row">
          <span class="tech-icon" aria-hidden="true" [style.color]="backupIcon(restoreTest(), restoreTestAt()).color">{{ backupIcon(restoreTest(), restoreTestAt()).icon }}</span>
          <span class="tech-label">{{ 'admin.system.restoreTest' | translate }}</span>
          <span class="tech-value" [style.color]="stale(restoreTest()) ? 'var(--text-error)' : null" data-testid="restore-test">
            @if (restoreTestAt(); as at) { {{ at | date: 'dd/MM HH:mm' }} } @else if (!restoreTestFailure()) { {{ 'admin.system.noRestoreTest' | translate }} }
          </span>
        </p>
        @if (restoreTestFailure(); as failure) {
          <p class="pl-4.5 break-words" style="color:var(--text-error)" data-testid="restore-test-failure">
            {{ 'admin.system.restoreTestFailed' | translate: { at: (failure.at | date: 'dd/MM HH:mm') } }}{{ failure.message ? ' : ' + failure.message : '' }}
          </p>
        }
      </section>

      @if (catalogue(); as pool) {
        <section data-testid="tech-catalogue">
          <h2 class="tech-title">{{ 'admin.system.catalogue' | translate }}</h2>
          <p class="tech-row">
            <span class="tech-icon" aria-hidden="true" [style.color]="countColor(pool.missingPreviewCount)">{{ countIcon(pool.missingPreviewCount) }}</span>
            <span class="tech-label">{{ 'admin.system.missingPreviews' | translate }}</span>
            @if (pool.missingPreviewCount > 0) {
              <a routerLink="/admin/catalogue" [queryParams]="{ extrait: 'absent' }" class="tech-value underline hover:text-(--text-hi)" style="color:var(--color-warn)"
                data-testid="missing-previews">{{ (pool.missingPreviewCount > 1 ? 'admin.system.tracksCount' : 'admin.system.trackCount') | translate: { count: pool.missingPreviewCount } }}</a>
            } @else {
              <span class="tech-value" data-testid="missing-previews">0</span>
            }
          </p>
          <p class="tech-row">
            <span class="tech-icon" aria-hidden="true" [style.color]="countColor(pool.missingWaveformCount)">{{ countIcon(pool.missingWaveformCount) }}</span>
            <span class="tech-label">{{ 'admin.system.missingWaveforms' | translate }}</span>
            <span class="tech-value" data-testid="missing-waveforms" [style.color]="pool.missingWaveformCount > 0 ? 'var(--color-warn)' : null">{{ pool.missingWaveformCount }}</span>
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
            <p class="tech-row" data-testid="nightly-job">
              <span class="tech-icon" aria-hidden="true" [style.color]="jobIcon(job).color">{{ jobIcon(job).icon }}</span>
              <span class="tech-label" [style.color]="job.tone === 'error' ? 'var(--text-error)' : null">{{ 'admin.system.jobs.' + job.id | translate }}</span>
              <span class="sr-only">{{ 'admin.system.jobTone.' + job.tone | translate }}</span>
              <span class="tech-value">{{ job.at ? (job.at | date: 'dd/MM HH:mm') : '-' }}</span>
            </p>
          }
        }
        @if (nextChallenge(); as next) {
          @let ok = next.kind === 'ready';
          <p class="tech-row mt-1 pt-1.5" style="border-top:1px solid var(--border-subtle)" data-testid="next-challenge">
            <span class="tech-icon" aria-hidden="true" [style.color]="ok ? 'var(--color-success)' : 'var(--text-error)'">{{ ok ? '✓' : '✗' }}</span>
            <span class="tech-label" [style.color]="ok ? null : 'var(--text-error)'">{{ (next.kind === 'retrying' ? 'admin.system.todayChallenge' : 'admin.system.nextChallenge') | translate }}</span>
            <span class="tech-value" [style.color]="ok ? null : 'var(--text-error)'">
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
        <!-- La prod et le staging côte à côte, chacun avec son indicateur. -->
        <div class="flex items-center gap-4 py-0.5">
          @for (line of ci(); track line.labelKey) {
            <a [href]="line.run?.url ?? line.url" target="_blank" rel="noopener" class="inline-flex items-center gap-1.5 hover:text-(--text-hi)" data-testid="ci-line"
              [title]="'admin.system.ciState.' + (line.run?.state ?? 'none') | translate">
              <span class="tech-icon" aria-hidden="true" [style.color]="ciColor(line)">{{ ciIcon(line) }}</span>
              <span style="color:var(--text-light)">{{ line.labelKey | translate }}</span>
              <span class="sr-only">{{ 'admin.system.ciState.' + (line.run?.state ?? 'none') | translate }}</span>
            </a>
          }
        </div>
      </section>

      <ng-content />
    </div>
  `,
  styles: `
    .tech-title { font-size: 12px; font-weight: 600; margin-bottom: 0.25rem; color: var(--text-faint); }
    /* Une information par ligne, sans retour à la ligne : le libellé se coupe avant la valeur. */
    .tech-row { display: flex; align-items: center; gap: 0.375rem; padding: 0.125rem 0; white-space: nowrap; }
    .tech-icon { width: 0.75rem; flex: none; text-align: center; font-weight: 700; }
    .tech-label { min-width: 0; overflow: hidden; text-overflow: ellipsis; color: var(--text-light); }
    .tech-value { margin-left: auto; flex: none; font-variant-numeric: tabular-nums; }
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
  /** Le dernier passage de la sauvegarde, s'il a échoué : son message s'affiche sous la ligne. */
  readonly backupFailure = input<BackupFailure | null>(null);
  /** Le contrôle de restauration de la sauvegarde (`backup-verify.sh`). */
  readonly restoreTest = input<BackupTone>('none');
  readonly restoreTestAt = input<string | null>(null);
  readonly restoreTestFailure = input<BackupFailure | null>(null);
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
  /** Le choix de l'admin (clic sur le verdict) ; `null` tant qu'il n'a pas cliqué : le verdict décide. */
  protected readonly commitsToggled = signal<boolean | null>(null);
  protected readonly commitsOpen = computed(() => this.commitsToggled() ?? VERDICTS_SHOWING_COMMITS.has(this.verdict()));

  /** La date affichée est celle du dernier succès : elle ne passe en rouge que trop vieille ; un échec a sa propre ligne. */
  protected readonly stale = (tone: BackupTone): boolean => tone === 'stale';

  protected short(sha: string | null): string {
    return shortCommit(sha) ?? '-';
  }

  protected jobIcon(job: NightlyJob): { icon: string; color: string } {
    return JOB_ICON[job.tone];
  }

  /** Sauvegarde ou contrôle de restauration : ✓ pour le dernier succès (un échec a sa ligne dessous), ✗ trop vieux, · jamais. */
  protected backupIcon(tone: BackupTone, at: string | null): { icon: string; color: string } {
    if (tone === 'stale') return { icon: '✗', color: 'var(--text-error)' };
    return at ? { icon: '✓', color: 'var(--color-success)' } : { icon: '·', color: 'var(--text-faint)' };
  }

  /** Un compte du catalogue : ✓ à zéro, ! sinon. */
  protected countIcon(count: number): string {
    return count > 0 ? '!' : '✓';
  }

  protected countColor(count: number): string {
    return count > 0 ? 'var(--color-warn)' : 'var(--color-success)';
  }

  protected ciIcon(line: CiLine): string {
    return CI_ICON[line.run?.state ?? 'none'];
  }

  protected ciColor(line: CiLine): string {
    return CI_COLOR[line.run?.state ?? 'none'];
  }
}
