import { Injectable, inject } from '@angular/core';
import { StoragePort } from '../../core/storage/storage.port';

const KEY = 'inseconds.lastGroup';

/**
 * Le dernier groupe que le joueur a regardé (au classement, ou choisi sur la carte amis de l'accueil), gardé dans le navigateur pour que la carte
 * montre celui-là quand il est dans plusieurs groupes. Un identifiant seulement, jamais un nom ni un pseudo.
 */
@Injectable({ providedIn: 'root' })
export class LastGroup {
  private readonly storage = inject(StoragePort);

  get(): number | null {
    const id = Number(this.storage.get(KEY));
    return Number.isInteger(id) && id > 0 ? id : null;
  }

  set(groupId: number): void {
    if (Number.isInteger(groupId) && groupId > 0) this.storage.set(KEY, String(groupId));
  }
}
