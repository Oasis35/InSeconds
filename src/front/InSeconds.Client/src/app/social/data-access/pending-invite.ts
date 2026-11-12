import { Injectable, inject } from '@angular/core';
import { StoragePort } from '../../core/storage/storage.port';
import { isInviteCode } from '../domain/group';

const KEY = 'inseconds.pendingGroupInvite';

/**
 * L'invitation à un groupe que le joueur n'a pas encore acceptée : le code du lien, gardé dans le navigateur le temps de créer un compte ou de
 * finir la playlist reçue avec le lien. Un code seulement, jamais un nom ni un pseudo.
 */
@Injectable({ providedIn: 'root' })
export class PendingInvite {
  private readonly storage = inject(StoragePort);

  get(): string | null {
    const code = this.storage.get(KEY);
    return isInviteCode(code) ? code.toUpperCase() : null;
  }

  set(code: string): void {
    if (isInviteCode(code)) this.storage.set(KEY, code.toUpperCase());
  }

  clear(): void {
    this.storage.remove(KEY);
  }
}
