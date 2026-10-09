import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminClient, JobStatusResponse } from '../../api/admin/api.generated';
import { JobStatus, toJobState } from '../domain/job';

/** Adaptateur du suivi des tâches (`api/admin`) : seule porte d'entrée vers le client généré. */
@Injectable({ providedIn: 'root' })
export class JobsApi {
  private readonly client = inject(AdminClient);

  async getStatus(id: string): Promise<JobStatus> {
    return toJobStatus(await firstValueFrom(this.client.getJobStatus(id)));
  }
}

function toJobStatus(response: JobStatusResponse): JobStatus {
  const result = response.result;
  return {
    id: response.id,
    state: toJobState(response.state),
    // Le compte rendu est un objet JSON (les tâches rendent un dictionnaire) ; autre chose n'a pas de sens pour l'écran.
    result: typeof result === 'object' && result !== null && !Array.isArray(result) ? (result as Record<string, unknown>) : null,
    errorCode: response.errorCode ?? null,
  };
}
