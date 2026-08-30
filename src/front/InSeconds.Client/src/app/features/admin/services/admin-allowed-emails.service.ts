import { Injectable, inject, signal, DestroyRef } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AdminApiService } from './admin-api.service';

/** État de l'onglet "Emails autorisés" : formulaire d'ajout + suppression. */
@Injectable()
export class AdminAllowedEmailsService {
  private readonly api = inject(AdminApiService);
  private readonly destroyRef = inject(DestroyRef);

  readonly allowedEmails = this.api.allowedEmails;
  readonly allowedEmailsLoading = this.api.allowedEmailsLoading;

  readonly addStatus = signal<'idle' | 'loading' | 'error'>('idle');
  readonly addErrorReason = signal<'duplicate' | 'invalid' | 'other' | null>(null);
  readonly removeStatus = signal<'idle' | 'loading' | 'error'>('idle');

  add(email: string): void {
    this.addStatus.set('loading');
    this.addErrorReason.set(null);
    this.api.addAllowedEmail(email).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.addStatus.set('idle');
        this.api.reloadAllowedEmails();
      },
      error: (err) => {
        this.addStatus.set('error');
        if (err.status === 409) this.addErrorReason.set('duplicate');
        else if (err.status === 400) this.addErrorReason.set('invalid');
        else this.addErrorReason.set('other');
      },
    });
  }

  remove(id: number): void {
    this.removeStatus.set('loading');
    this.api.removeAllowedEmail(id).pipe(takeUntilDestroyed(this.destroyRef)).subscribe({
      next: () => {
        this.removeStatus.set('idle');
        this.api.reloadAllowedEmails();
      },
      error: () => this.removeStatus.set('error'),
    });
  }
}
