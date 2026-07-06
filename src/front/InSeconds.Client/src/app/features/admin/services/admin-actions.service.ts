import { Injectable, inject, signal, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AdminApiService } from './admin-api.service';
import { ResetResult } from '../admin.models';

/** État de l'onglet actions : génération du défi du jour, reset des parties. */
@Injectable()
export class AdminActionsService {
  private readonly api = inject(AdminApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly generateStatus = signal<'idle' | 'loading' | 'success' | 'already' | 'pool_insufficient' | 'error'>('idle');
  readonly resetStatus = signal<'idle' | 'loading' | 'success' | 'error'>('idle');
  readonly resetResult = signal<ResetResult | null>(null);
  private generateStatusTimer: ReturnType<typeof setTimeout> | null = null;

  generateToday(): void {
    this.generateStatus.set('loading');
    this.api.generateToday().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.generateStatus.set('success');
        this.api.reloadAll();
        if (this.generateStatusTimer) clearTimeout(this.generateStatusTimer);
        this.generateStatusTimer = setTimeout(() => { this.generateStatus.set('idle'); this.generateStatusTimer = null; }, 3000);
      },
      error: (err) => {
        if (err.status === 409) this.generateStatus.set('already');
        else if (err.status === 422) this.generateStatus.set('pool_insufficient');
        else this.generateStatus.set('error');
        if (this.generateStatusTimer) clearTimeout(this.generateStatusTimer);
        this.generateStatusTimer = setTimeout(() => { this.generateStatus.set('idle'); this.generateStatusTimer = null; }, 3000);
      },
    });
  }

  reset(): void {
    this.resetStatus.set('loading');
    this.resetResult.set(null);
    this.api.resetToday().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: res => {
        this.resetResult.set(res);
        this.resetStatus.set('success');
        this.api.reloadStats();
      },
      error: () => this.resetStatus.set('error'),
    });
  }
}
