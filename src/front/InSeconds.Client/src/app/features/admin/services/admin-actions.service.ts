import { Injectable, inject, signal, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AdminApiService } from './admin-api.service';
import { SettingsService } from '../../../core/services/settings.service';
import { RefreshPreviewsResult, ResetResult } from '../admin.models';

type SimpleAsyncStatus = 'idle' | 'loading' | 'success' | 'error';

/** État de l'onglet actions : génération du défi du jour, reset des parties, réglage du cooldown. */
@Injectable()
export class AdminActionsService {
  private readonly api = inject(AdminApiService);
  private readonly settings = inject(SettingsService);
  private readonly destroyRef = inject(DestroyRef);

  readonly generateStatus = signal<'idle' | 'loading' | 'success' | 'already' | 'pool_insufficient' | 'error'>('idle');
  readonly resetStatus = signal<SimpleAsyncStatus>('idle');
  readonly resetResult = signal<ResetResult | null>(null);
  readonly refreshPreviewsStatus = signal<SimpleAsyncStatus>('idle');
  readonly refreshPreviewsResult = signal<RefreshPreviewsResult | null>(null);
  readonly trackCooldownDaysInput = signal<number | null>(null);
  readonly updateCooldownStatus = signal<SimpleAsyncStatus>('idle');
  private generateStatusTimer: ReturnType<typeof setTimeout> | null = null;
  private updateCooldownStatusTimer: ReturnType<typeof setTimeout> | null = null;

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

  refreshPreviews(): void {
    this.refreshPreviewsStatus.set('loading');
    this.refreshPreviewsResult.set(null);
    this.api.refreshPreviews().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: res => {
        this.refreshPreviewsResult.set(res);
        this.refreshPreviewsStatus.set('success');
        this.api.reloadPool();
      },
      error: () => this.refreshPreviewsStatus.set('error'),
    });
  }

  updateTrackCooldownDays(days: number): void {
    this.updateCooldownStatus.set('loading');
    this.api.updateTrackCooldownDays(days).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.updateCooldownStatus.set('success');
        this.settings.load().subscribe();
        if (this.updateCooldownStatusTimer) clearTimeout(this.updateCooldownStatusTimer);
        this.updateCooldownStatusTimer = setTimeout(() => {
          if (this.updateCooldownStatus() === 'success') this.updateCooldownStatus.set('idle');
          this.updateCooldownStatusTimer = null;
        }, 3000);
      },
      error: () => {
        this.updateCooldownStatus.set('error');
        if (this.updateCooldownStatusTimer) clearTimeout(this.updateCooldownStatusTimer);
        this.updateCooldownStatusTimer = setTimeout(() => {
          if (this.updateCooldownStatus() === 'error') this.updateCooldownStatus.set('idle');
          this.updateCooldownStatusTimer = null;
        }, 3000);
      },
    });
  }
}
