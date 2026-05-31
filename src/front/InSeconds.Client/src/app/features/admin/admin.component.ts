import { Component, inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface ResetResult {
  deleted: number;
  date: string;
}

@Component({
  selector: 'app-admin',
  template: `
    <div class="min-h-screen bg-gray-900 text-white flex flex-col items-center justify-center gap-8 p-8">
      <h1 class="text-3xl font-bold">Admin</h1>

      <div class="bg-gray-800 rounded-xl p-8 flex flex-col items-center gap-6 w-full max-w-md">
        <h2 class="text-xl font-semibold">Reset des parties du jour</h2>
        <p class="text-gray-400 text-sm text-center">
          Supprime toutes les sessions de jeu liées au défi d'aujourd'hui.
        </p>

        <button
          (click)="reset()"
          [disabled]="status() === 'loading'"
          class="bg-red-600 hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed
                 text-white font-bold py-3 px-8 rounded-lg transition-colors">
          @if (status() === 'loading') {
            Réinitialisation...
          } @else {
            Réinitialiser les parties du jour
          }
        </button>

        @if (status() === 'success' && result()) {
          <div class="bg-green-800 text-green-200 rounded-lg px-6 py-4 text-center">
            <p class="font-semibold">Reset effectué</p>
            <p class="text-sm mt-1">{{ result()!.deleted }} session(s) supprimée(s) — {{ result()!.date }}</p>
          </div>
        }

        @if (status() === 'error') {
          <div class="bg-red-900 text-red-200 rounded-lg px-6 py-4 text-center">
            <p class="font-semibold">Erreur</p>
            <p class="text-sm mt-1">Aucun défi trouvé pour aujourd'hui, ou endpoint indisponible.</p>
          </div>
        }
      </div>
    </div>
  `,
})
export class AdminComponent {
  private readonly http = inject(HttpClient);

  status = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  result = signal<ResetResult | null>(null);

  reset(): void {
    this.status.set('loading');
    this.result.set(null);

    this.http
      .delete<ResetResult>(`${environment.apiUrl}/api/admin/reset-today`, { withCredentials: true })
      .subscribe({
        next: res => {
          this.result.set(res);
          this.status.set('success');
        },
        error: () => this.status.set('error'),
      });
  }
}
