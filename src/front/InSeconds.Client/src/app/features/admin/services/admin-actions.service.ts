import { Injectable, inject, signal } from '@angular/core';
import { AdminApiService } from './admin-api.service';
import { ResetResult } from '../admin.models';

/** État de l'onglet actions : génération du défi du jour, reset des parties. */
@Injectable()
export class AdminActionsService {
  private readonly api = inject(AdminApiService);

  readonly generateStatus = signal<'idle' | 'loading' | 'success' | 'already' | 'pool_insufficient' | 'error'>('idle');
  readonly resetStatus = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  readonly resetResult = signal<ResetResult | null>(null);

  generateToday(): void {
    this.generateStatus.set('loading');
    this.api.generateToday().subscribe({
      next: () => {
        this.generateStatus.set('success');
        this.api.reloadAll();
        setTimeout(() => this.generateStatus.set('idle'), 3000);
      },
      error: (err) => {
        if (err.status === 409) this.generateStatus.set('already');
        else if (err.status === 422) this.generateStatus.set('pool_insufficient');
        else this.generateStatus.set('error');
        setTimeout(() => this.generateStatus.set('idle'), 3000);
      },
    });
  }

  reset(): void {
    this.resetStatus.set('loading');
    this.resetResult.set(null);
    this.api.resetToday().subscribe({
      next: res => {
        this.resetResult.set(res);
        this.resetStatus.set('success');
        this.api.reloadStats();
      },
      error: () => this.resetStatus.set('error'),
    });
  }
}
