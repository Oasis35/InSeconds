import { Injectable, signal } from '@angular/core';

/**
 * État de la modale de confirmation de sortie en cours de partie (cf. `unsavedGameGuard`).
 * Le `HostListener('window:beforeunload')` et l'`effect()` de résolution automatique restent
 * dans `GameComponent` (Angular n'attache les décorateurs de composant qu'à des composants),
 * ce service ne porte que la machine à états de la modale + la Promise en attente.
 */
@Injectable()
export class LeaveConfirmationService {
  readonly showLeaveConfirm = signal(false);
  private leaveResolve: ((ok: boolean) => void) | null = null;

  get hasPending(): boolean {
    return this.leaveResolve !== null;
  }

  /** Ouvre la modale et retourne une Promise résolue par `confirm()`/`cancel()`. */
  request(): Promise<boolean> {
    // Une confirmation déjà en attente (navigation ré-entrante) : on la résout
    // avant d'en ouvrir une nouvelle pour ne pas laisser de Promise orpheline.
    this.resolve(false);
    this.showLeaveConfirm.set(true);
    return new Promise<boolean>(resolve => {
      this.leaveResolve = resolve;
    });
  }

  resolve(ok: boolean): void {
    this.showLeaveConfirm.set(false);
    const resolve = this.leaveResolve;
    this.leaveResolve = null;
    resolve?.(ok);
  }

  confirm(): void {
    this.resolve(true);
  }

  cancel(): void {
    this.resolve(false);
  }
}
