import { DOCUMENT } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { arrivalSource } from '../domain/arrival-source';

export const ARRIVAL_SOURCE_KEY = 'inseconds.arrivalSource';

/**
 * La source d'arrivée de cet onglet (`utm_source` ou domaine du référent, cf. `arrivalSource`), notée
 * au démarrage et gardée dans `sessionStorage` : elle survit à la redirection vers `/daily` et à la
 * navigation jusqu'au premier « Commencer », qui l'envoie avec la création de l'invité. La première
 * notée dans l'onglet reste. `sessionStorage` peut être indisponible : rien ne lève alors.
 */
@Injectable({ providedIn: 'root' })
export class ArrivalSourceService {
  private readonly document = inject(DOCUMENT);

  capture(): void {
    if (this.get() !== null) return;
    const source = arrivalSource(this.document.location.href, this.document.referrer);
    if (source === null) return;
    try {
      sessionStorage.setItem(ARRIVAL_SOURCE_KEY, source);
    } catch {
      // stockage indisponible : l'invité sera compté en arrivée directe
    }
  }

  get(): string | null {
    try {
      return sessionStorage.getItem(ARRIVAL_SOURCE_KEY);
    } catch {
      return null;
    }
  }
}
