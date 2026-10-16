import { JobLastRun, JobState } from './job';
import { challengeWitness, isValidCooldownDays, previewsWitness, toRefreshReport } from './actions';

const AT = '2026-10-09T00:00:03Z';
const RETRY_AT = '2026-10-09T00:10:03Z';

function run(state: JobState | null, result: Record<string, unknown> | null = null, errorCode: string | null = null): JobLastRun {
  return {
    id: 'job', state, at: state === null ? null : AT, result, errorCode,
    retryAt: state === 'retry_scheduled' ? RETRY_AT : null, nextRunAt: '2026-10-10T00:00:00Z',
  };
}

describe('actions (domaine)', () => {
  it('valide le délai : entier de 1 à 3650', () => {
    expect([1, 30, 3650].every(isValidCooldownDays)).toBe(true);
    expect([0, 3651, 1.5, null, undefined, NaN].some(isValidCooldownDays)).toBe(false);
  });

  describe('témoin du défi du jour', () => {
    it('généré, ou déjà en place, avec l\'heure du passage', () => {
      expect(challengeWitness(run('succeeded', { created: true }))).toEqual({ tone: 'ok', key: 'challengeCreated', counts: {}, at: AT, retryAt: null });
      expect(challengeWitness(run('succeeded', { created: false }))).toMatchObject({ tone: 'ok', key: 'challengeAlready' });
    });

    it('pool insuffisant : à surveiller, avec l\'heure du prochain essai', () => {
      expect(challengeWitness(run('retry_scheduled', null, 'admin.pool_insufficient')))
        .toEqual({ tone: 'warn', key: 'poolInsufficient', counts: {}, at: AT, retryAt: RETRY_AT });
      // Les 144 essais épuisés : plus de prochain essai.
      expect(challengeWitness(run('failed', null, 'admin.pool_insufficient'))).toMatchObject({ tone: 'warn', retryAt: null });
    });

    it('échec imprévu, en cours, jamais lancée ou effacée', () => {
      expect(challengeWitness(run('failed', null, 'common.unexpected'))).toMatchObject({ tone: 'error', key: 'failed', at: AT });
      expect(challengeWitness(run('processing'))).toMatchObject({ tone: 'running', key: 'running' });
      expect(challengeWitness(run('queued'))).toMatchObject({ tone: 'running' });
      expect(challengeWitness(run(null))).toMatchObject({ tone: 'none', key: 'never', at: null });
      expect(challengeWitness(run('deleted'))).toMatchObject({ tone: 'none', key: 'never' });
      expect(challengeWitness(undefined)).toMatchObject({ tone: 'none', key: 'never' });
    });
  });

  describe('témoin des previews', () => {
    it('le compte rendu, à surveiller si Deezer n\'a pas répondu pour un morceau', () => {
      expect(previewsWitness(run('succeeded', { checked: 12, updated: 3, failed: 0 })))
        .toEqual({ tone: 'ok', key: 'previewsReport', counts: { checked: 12, updated: 3, failed: 0 }, at: AT, retryAt: null });
      expect(previewsWitness(run('succeeded', { checked: 12, updated: 3, failed: 2 }))).toMatchObject({ tone: 'warn', key: 'previewsReport' });
    });

    it('sans compte rendu lisible : contrôlé, sans les nombres', () => {
      expect(previewsWitness(run('succeeded', { checked: 5 }))).toMatchObject({ tone: 'ok', key: 'previewsChecked', counts: {} });
    });

    it('échec (avec le prochain essai), en cours, jamais lancée', () => {
      expect(previewsWitness(run('retry_scheduled', null, 'common.unexpected'))).toMatchObject({ tone: 'error', key: 'failed', retryAt: RETRY_AT });
      expect(previewsWitness(run('processing'))).toMatchObject({ tone: 'running' });
      expect(previewsWitness(run(null))).toMatchObject({ tone: 'none' });
    });
  });

  it('compte rendu du contrôle : lu si réussi et complet, sinon null', () => {
    expect(toRefreshReport(run('succeeded', { checked: 5, updated: 2, failed: 1 }))).toEqual({ checked: 5, updated: 2, failed: 1 });
    expect(toRefreshReport(run('succeeded', { checked: 5 }))).toBeNull();
    expect(toRefreshReport(run('succeeded'))).toBeNull();
    expect(toRefreshReport(run('failed', { checked: 1, updated: 1, failed: 1 }))).toBeNull();
  });
});
