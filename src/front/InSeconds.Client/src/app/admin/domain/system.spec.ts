import { JobLastRun, JobState } from './job';
import {
  NightlyJob, alertCount, backupTone, deployedBranch, deploymentVerdict, jobTone, nightlyJobs, sameCommit, shortCommit, toCiState,
} from './system';

const AT = '2026-11-04T00:00:03Z';
const SHA = '4f2a9c1d8e7b6a5f4e3d2c1b0a9f8e7d6c5b4a39';
const OTHER = '9b8a7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b';

function run(id: string, state: JobState | null, result: Record<string, unknown> | null = null, errorCode: string | null = null): JobLastRun {
  return { id, state, at: state === null ? null : AT, result, errorCode, retryAt: null, nextRunAt: null };
}

describe('système (domaine)', () => {
  it('la branche déployée : main en prod, env/staging au staging, aucune ailleurs', () => {
    expect(['production', 'staging', 'development', 'e2e'].map(deployedBranch)).toEqual(['main', 'env/staging', null, null]);
  });

  it('commit abrégé à 7 caractères, et comparaison qui tolère une empreinte abrégée', () => {
    expect(shortCommit(SHA)).toBe('4f2a9c1');
    expect(shortCommit(null)).toBeNull();
    expect(sameCommit(SHA, '4F2A9C1')).toBe(true);
    expect(sameCommit(SHA, OTHER)).toBe(false);
  });

  it('verdict du déploiement : à jour, identiques, en retard sur la branche, désalignés, inconnu', () => {
    expect(deploymentVerdict(SHA, SHA, SHA)).toBe('aligned');
    expect(deploymentVerdict(SHA, SHA, null)).toBe('same');
    expect(deploymentVerdict(SHA, SHA, OTHER)).toBe('pending');
    expect(deploymentVerdict(SHA, OTHER, SHA)).toBe('mismatch');
    expect(deploymentVerdict(null, SHA, SHA)).toBe('unknown');
    expect(deploymentVerdict(SHA, null, SHA)).toBe('unknown');
  });

  it('état de la CI d\'après GitHub : en cours tant que non terminée, rouge sur un échec, inconnu si annulée', () => {
    expect(toCiState('in_progress', null)).toBe('running');
    expect(toCiState('queued', null)).toBe('running');
    expect(toCiState('completed', 'success')).toBe('success');
    expect(['failure', 'timed_out', 'startup_failure'].map(c => toCiState('completed', c))).toEqual(['failure', 'failure', 'failure']);
    expect(toCiState('completed', 'cancelled')).toBe('unknown');
    expect(toCiState(null, null)).toBe('unknown');
  });

  it('couleur d\'une tâche : réussie, pool insuffisant ou extraits en échec à surveiller, échec, en cours, jamais lancée', () => {
    expect(jobTone(run('j', 'succeeded', { created: true }))).toBe('ok');
    expect(jobTone(run('j', 'succeeded', { checked: 10, updated: 1, failed: 0 }))).toBe('ok');
    expect(jobTone(run('j', 'succeeded', { checked: 10, updated: 1, failed: 2 }))).toBe('warn');
    expect(jobTone(run('j', 'retry_scheduled', null, 'admin.pool_insufficient'))).toBe('warn');
    expect(jobTone(run('j', 'failed'))).toBe('error');
    expect(jobTone(run('j', 'processing'))).toBe('running');
    expect(jobTone(run('j', 'deleted'))).toBe('none');
    expect(jobTone(run('j', null))).toBe('none');
    expect(jobTone(undefined)).toBe('none');
  });

  it('les quatre tâches de la nuit, dans l\'ordre de la nuit, même celles que l\'API ne rend pas', () => {
    const jobs = nightlyJobs([run('daily-close-day', 'failed'), run('catalogue-refresh', 'succeeded'), run('autre', 'failed')]);

    expect(jobs.map(j => [j.id, j.tone])).toEqual([
      ['catalogue-refresh', 'ok'], ['daily-generate-challenge', 'none'], ['daily-close-day', 'error'], ['players-purge-expired-tokens', 'none'],
    ]);
  });

  it('sauvegarde : à jour jusqu\'à 26 heures, manquée au-delà, aucune au staging', () => {
    const now = new Date('2026-11-04T09:00:00Z');
    expect(backupTone('2026-11-04T03:00:41Z', now)).toBe('ok');
    expect(backupTone('2026-11-03T06:59:00Z', now)).toBe('stale');
    expect(backupTone(null, now)).toBe('none');
  });

  it('compte les alertes : déploiement, API, sauvegarde, tâches à surveiller ou en échec, CI rouge', () => {
    const jobs: NightlyJob[] = [{ id: 'a', tone: 'ok', at: AT }, { id: 'b', tone: 'warn', at: AT }, { id: 'c', tone: 'error', at: AT }];
    const red = { branch: 'main', headSha: SHA, state: 'failure' as const, url: '' };

    expect(alertCount({ verdict: 'aligned', apiDown: false, backup: 'ok', jobs: [], ci: [null] })).toBe(0);
    expect(alertCount({ verdict: 'pending', apiDown: true, backup: 'stale', jobs, ci: [red, null] })).toBe(1 + 1 + 1 + 2 + 1);
    expect(alertCount({ verdict: 'mismatch', apiDown: false, backup: 'none', jobs: [], ci: [] })).toBe(1);
  });
});
