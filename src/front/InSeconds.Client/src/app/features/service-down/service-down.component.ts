import { Component, ChangeDetectionStrategy } from '@angular/core';

/**
 * Overlay plein écran affiché quand le backend ne répond plus (KO ou redéploiement
 * en cours). Bloque l'interaction. Le polling de santé dans `App` fait disparaître
 * cet overlay automatiquement dès que le backend redevient joignable — aucune action
 * du joueur requise.
 */
@Component({
  selector: 'app-service-down',
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="fixed inset-0 z-50 bg-gradient-to-br from-slate-900 via-slate-950 to-black text-slate-100 flex flex-col items-center justify-center p-6 text-center">
      <p class="text-7xl mb-6">🎧</p>
      <h1 class="text-3xl font-bold mb-2">Service indisponible</h1>
      <p class="text-slate-400 mb-8 max-w-sm">
        L'application revient dans un instant. Cette page se rafraîchira toute seule
        dès que le service sera de retour.
      </p>
      <div class="flex items-center gap-2 text-sm text-slate-500">
        <span class="inline-block w-2 h-2 rounded-full bg-amber-400 animate-pulse"></span>
        Reconnexion en cours…
      </div>
    </div>
  `,
})
export class ServiceDownComponent {}
