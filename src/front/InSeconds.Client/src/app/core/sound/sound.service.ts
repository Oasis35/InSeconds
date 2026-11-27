import { Injectable, computed, inject, signal } from '@angular/core';
import { StoragePort } from '../storage/storage.port';
import { SoundName, SoundPort } from './sound.port';

const KEY = 'inseconds.sounds';

/**
 * Les bruitages du jeu et le réglage « Bruitages » (activés par défaut, choix gardé dans le navigateur : « off » seulement, jamais lié au
 * compte). Sur iPhone, l'interrupteur silencieux coupe déjà les sons web.
 */
@Injectable({ providedIn: 'root' })
export class SoundService {
  private readonly storage = inject(StoragePort);
  private readonly port = inject(SoundPort);
  private readonly on = signal(this.storage.get(KEY) !== 'off');

  readonly enabled = computed(() => this.on());

  /** À appeler dans un clic, avant tout `await`. Sans effet quand les sons sont coupés. */
  unlock(): void {
    if (this.on()) this.port.unlock();
  }

  play(name: SoundName): void {
    if (this.on()) this.port.play(name);
  }

  setEnabled(enabled: boolean): void {
    this.on.set(enabled);
    if (enabled) {
      this.storage.remove(KEY);
      this.port.unlock();
    } else {
      this.storage.set(KEY, 'off');
    }
  }
}
