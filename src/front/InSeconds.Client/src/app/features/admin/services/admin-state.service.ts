import { Injectable, signal } from '@angular/core';

@Injectable()
export class AdminStateService {
  readonly selectedDay = signal<string>(new Date().toISOString().slice(0, 10));
  readonly poolSearchQuery = signal('');
  readonly poolReloadTrigger = signal(0);
  readonly challengesReloadTrigger = signal(0);
  readonly allowedEmailsReloadTrigger = signal(0);

  reloadPool(): void {
    this.poolReloadTrigger.update(v => v + 1);
  }

  reloadChallenges(): void {
    this.challengesReloadTrigger.update(v => v + 1);
  }

  reloadAllowedEmails(): void {
    this.allowedEmailsReloadTrigger.update(v => v + 1);
  }
}
