import { Injectable, inject } from '@angular/core';
import { JOB_POLL_INTERVAL_MS, JobStatus, isSettled } from '../domain/job';
import { JobsApi } from './jobs.api';

/**
 * Suit l'exécution d'une tâche lancée par un bouton de l'admin (§ 5.4 bis du plan v2) : lit son état
 * toutes les 2 secondes jusqu'à ce qu'elle soit réussie, échouée, supprimée ou en attente d'un
 * réessai, et rend ce dernier état avec le compte rendu ou le code d'erreur.
 */
@Injectable({ providedIn: 'root' })
export class JobRunner {
  private readonly jobs = inject(JobsApi);

  /** `onUpdate` reçoit chaque état lu (« en file », « en cours »…). Une erreur de lecture est relancée. */
  async follow(id: string, onUpdate?: (status: JobStatus) => void): Promise<JobStatus> {
    for (;;) {
      const status = await this.jobs.getStatus(id);
      onUpdate?.(status);
      if (isSettled(status.state)) return status;
      await new Promise<void>(resolve => setTimeout(resolve, JOB_POLL_INTERVAL_MS));
    }
  }
}
