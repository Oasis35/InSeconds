import { Component, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';

@Component({
  selector: 'app-not-found',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="min-h-dvh bg-gradient-to-br from-slate-900 via-slate-950 to-black text-slate-100 flex flex-col items-center justify-center p-6 text-center">
      <p class="text-7xl mb-6">🎵</p>
      <h1 class="text-3xl font-bold mb-2">Page introuvable</h1>
      <p class="text-slate-400 mb-8">Cette page n'existe pas ou a été déplacée.</p>
      <a routerLink="/"
        class="px-6 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition-colors">
        Retour au jeu
      </a>
    </div>
  `,
})
export class NotFoundComponent {}
