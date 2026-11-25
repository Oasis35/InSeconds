import { Injectable, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { isSavingData } from '../../../core/network/save-data';
import { unlockSharedAudio } from '../../../gameplay/data-access/shared-audio';
import { START_INTENT } from '../start-intent';

/**
 * Lance la manche depuis l'accueil. Fourni par `DailyShellComponent`, utilisé par l'accueil et par le panneau de série (« Jouer maintenant »).
 *
 * **Le son se déverrouille dans ce clic**, avant tout `await` et avant que le code de la manche ne soit chargé (iPhone : un son lancé hors d'un
 * geste reste muet) : l'élément audio partagé joue un silence, la manche le retrouve déverrouillé.
 */
@Injectable()
export class DailyLauncher {
  private readonly router = inject(Router);

  /** La manche s'ouvre (code à télécharger, partie à créer) : l'accueil montre son écran de chargement, comme avant la séparation. */
  readonly starting = signal(false);

  private prefetched = false;

  /** Déverrouille le son : à appeler dans le gestionnaire d'un clic, avant tout `await`. */
  unlock(): void {
    unlockSharedAudio();
  }

  /** À appeler dans le gestionnaire du clic. La manche prend la place de l'accueil dans l'historique : le retour arrière en pleine partie quitte la partie (avec confirmation), comme avant. */
  start(): void {
    this.unlock();
    if (this.starting()) return;
    this.starting.set(true);
    void this.router
      .navigate(['/daily'], { info: START_INTENT, queryParamsHandling: 'preserve', replaceUrl: true })
      .catch(() => false)
      .finally(() => this.starting.set(false));
  }

  /**
   * Télécharge le code de la manche en tâche de fond une fois l'accueil affiché, pour que le clic ne l'attende pas. Seul le fichier est mis
   * en cache : rien n'en est exécuté. Jamais en économie de données, une seule fois, un échec se rattrape au clic.
   */
  prefetch(): void {
    if (this.prefetched || isSavingData()) return;
    this.prefetched = true;
    const load = () => void import('../daily-round.routes').catch(() => { this.prefetched = false; });
    if (typeof requestIdleCallback === 'function') requestIdleCallback(load);
    else setTimeout(load, 1500);
  }
}
