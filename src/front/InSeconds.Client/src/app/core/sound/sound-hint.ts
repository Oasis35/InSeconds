import { Injectable, inject, signal } from '@angular/core';
import { StoragePort } from '../storage/storage.port';

const KEY = 'inseconds.soundHintSeen';

/** L'invitation à couper les bruitages, montrée une seule fois par navigateur (la manche du jour) : un drapeau dans le stockage local. */
@Injectable({ providedIn: 'root' })
export class SoundHint {
  private readonly storage = inject(StoragePort);
  private readonly seen = signal(this.storage.get(KEY) === '1');

  /** Vrai tant que l'invitation n'a pas été montrée. */
  readonly pending = () => !this.seen();

  markSeen(): void {
    this.seen.set(true);
    this.storage.set(KEY, '1');
  }
}
