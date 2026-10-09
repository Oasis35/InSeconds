import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminClient, JobLastRun as JobLastRunResponse } from '../../api/admin/api.generated';
import { JobLastRun, toJobState } from '../domain/job';

/** Adaptateur des tâches planifiées (`api/admin`) : seule porte d'entrée vers le client généré. */
@Injectable({ providedIn: 'root' })
export class JobsApi {
  private readonly client = inject(AdminClient);

  /** Le dernier passage de chaque tâche récurrente. */
  async getLastRuns(): Promise<JobLastRun[]> {
    return (await firstValueFrom(this.client.getJobLastRuns())).map(toJobLastRun);
  }
}

function toJobLastRun(response: JobLastRunResponse): JobLastRun {
  const result = response.result;
  return {
    id: response.id,
    state: toJobState(response.state),
    at: toInstant(response.at),
    // Le compte rendu est un objet JSON (les tâches rendent un dictionnaire) ; autre chose n'a pas de sens pour l'écran.
    result: typeof result === 'object' && result !== null && !Array.isArray(result) ? (result as Record<string, unknown>) : null,
    errorCode: response.errorCode ?? null,
    retryAt: toInstant(response.retryAt),
    nextRunAt: toInstant(response.nextRunAt),
  };
}

/** Le client annonce un `Date`, le JSON livre un texte ISO avec fuseau : on le garde tel quel. */
function toInstant(value: Date | string | undefined | null): string | null {
  if (value === undefined || value === null) return null;
  return typeof value === 'string' ? value : value.toISOString();
}
