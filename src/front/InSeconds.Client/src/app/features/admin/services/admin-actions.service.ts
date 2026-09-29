import { Injectable, inject, signal, linkedSignal, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { form, min, required } from '@angular/forms/signals';
import { AdminApiService } from './admin-api.service';
import { SettingsService } from '../../../core/services/settings.service';
import { RefreshPreviewsResult } from '../admin.models';

type SimpleAsyncStatus = 'idle' | 'loading' | 'success' | 'error';

/** État de l'onglet actions : génération du défi du jour, reset des parties, réglage du cooldown. */
@Injectable()
export class AdminActionsService {
  private readonly api = inject(AdminApiService);
  private readonly settings = inject(SettingsService);
  private readonly destroyRef = inject(DestroyRef);

  private readonly _generateStatus = signal<'idle' | 'loading' | 'success' | 'already' | 'pool_insufficient' | 'error'>('idle');
  readonly generateStatus = this._generateStatus.asReadonly();
  private readonly _refreshPreviewsStatus = signal<SimpleAsyncStatus>('idle');
  readonly refreshPreviewsStatus = this._refreshPreviewsStatus.asReadonly();
  private readonly _refreshPreviewsResult = signal<RefreshPreviewsResult | null>(null);
  readonly refreshPreviewsResult = this._refreshPreviewsResult.asReadonly();
  /**
   * Champ « délai avant réutilisation » (Signal Forms) : repart de la valeur serveur courante
   * (et s'y recale après chaque rechargement des settings), au moins 1 jour.
   */
  readonly cooldownForm = form(
    linkedSignal(() => ({ days: this.settings.trackCooldownDays() as number | null })),
    p => {
      required(p.days);
      min(p.days, 1);
    },
  );
  private readonly _updateCooldownStatus = signal<SimpleAsyncStatus>('idle');
  readonly updateCooldownStatus = this._updateCooldownStatus.asReadonly();
  private generateStatusTimer: ReturnType<typeof setTimeout> | null = null;
  private updateCooldownStatusTimer: ReturnType<typeof setTimeout> | null = null;

  generateToday(): void {
    this._generateStatus.set('loading');
    this.api.generateToday().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this._generateStatus.set('success');
        this.api.reloadAll();
        if (this.generateStatusTimer) clearTimeout(this.generateStatusTimer);
        this.generateStatusTimer = setTimeout(() => { this._generateStatus.set('idle'); this.generateStatusTimer = null; }, 3000);
      },
      error: (err) => {
        if (err.status === 409) this._generateStatus.set('already');
        else if (err.status === 422) this._generateStatus.set('pool_insufficient');
        else this._generateStatus.set('error');
        if (this.generateStatusTimer) clearTimeout(this.generateStatusTimer);
        this.generateStatusTimer = setTimeout(() => { this._generateStatus.set('idle'); this.generateStatusTimer = null; }, 3000);
      },
    });
  }

  refreshPreviews(): void {
    this._refreshPreviewsStatus.set('loading');
    this._refreshPreviewsResult.set(null);
    this.api.refreshPreviews().pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: res => {
        this._refreshPreviewsResult.set(res);
        this._refreshPreviewsStatus.set('success');
        this.api.reloadPool();
      },
      error: () => this._refreshPreviewsStatus.set('error'),
    });
  }

  /** Bouton « Enregistrer » du délai : envoie la valeur saisie si elle est valide. */
  saveTrackCooldownDays(): void {
    const days = this.cooldownForm.days().value();
    if (days === null || this.cooldownForm().invalid()) return;
    this.updateTrackCooldownDays(days);
  }

  updateTrackCooldownDays(days: number): void {
    this._updateCooldownStatus.set('loading');
    this.api.updateTrackCooldownDays(days).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this._updateCooldownStatus.set('success');
        this.settings.load().subscribe();
        if (this.updateCooldownStatusTimer) clearTimeout(this.updateCooldownStatusTimer);
        this.updateCooldownStatusTimer = setTimeout(() => {
          if (this.updateCooldownStatus() === 'success') this._updateCooldownStatus.set('idle');
          this.updateCooldownStatusTimer = null;
        }, 3000);
      },
      error: () => {
        this._updateCooldownStatus.set('error');
        if (this.updateCooldownStatusTimer) clearTimeout(this.updateCooldownStatusTimer);
        this.updateCooldownStatusTimer = setTimeout(() => {
          if (this.updateCooldownStatus() === 'error') this._updateCooldownStatus.set('idle');
          this.updateCooldownStatusTimer = null;
        }, 3000);
      },
    });
  }
}
