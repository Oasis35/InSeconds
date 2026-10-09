import { JobState, JobStatus } from './job';
import { isValidCooldownDays, toGenerateOutcome, toRefreshReport } from './actions';

function job(state: JobState, result: Record<string, unknown> | null = null, errorCode: string | null = null): JobStatus {
  return { id: '1', state, result, errorCode };
}

describe('actions (domaine)', () => {
  it('valide le délai : entier de 1 à 3650', () => {
    expect([1, 30, 3650].every(isValidCooldownDays)).toBe(true);
    expect([0, 3651, 1.5, null, undefined, NaN].some(isValidCooldownDays)).toBe(false);
  });

  it('génération : créé, déjà généré, pool insuffisant, erreur, réessai', () => {
    expect(toGenerateOutcome(job('succeeded', { created: true }))).toBe('created');
    expect(toGenerateOutcome(job('succeeded', { created: false }))).toBe('already');
    expect(toGenerateOutcome(job('failed', null, 'admin.pool_insufficient'))).toBe('pool_insufficient');
    expect(toGenerateOutcome(job('failed', null, 'common.unexpected'))).toBe('error');
    expect(toGenerateOutcome(job('deleted'))).toBe('error');
    expect(toGenerateOutcome(job('retry_scheduled'))).toBe('retry');
  });

  it('compte rendu du contrôle : lu si réussi et complet, sinon null', () => {
    expect(toRefreshReport(job('succeeded', { checked: 5, updated: 2, failed: 1 }))).toEqual({ checked: 5, updated: 2, failed: 1 });
    expect(toRefreshReport(job('succeeded', { checked: 5 }))).toBeNull();
    expect(toRefreshReport(job('succeeded'))).toBeNull();
    expect(toRefreshReport(job('failed', { checked: 1, updated: 1, failed: 1 }))).toBeNull();
  });
});
