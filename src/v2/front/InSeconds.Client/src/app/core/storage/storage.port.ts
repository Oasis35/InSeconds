import { Injectable } from '@angular/core';

/**
 * Accès au stockage local du navigateur (port transverse, § 6.1 du plan v2). `localStorage` peut
 * être indisponible (navigation privée stricte, stockage plein) : ces méthodes ne lèvent jamais.
 * Remplacé par une implémentation en mémoire dans les tests.
 */
// Fabrique paresseuse : BrowserStoragePort est déclarée plus bas dans le fichier.
@Injectable({ providedIn: 'root', useFactory: () => new BrowserStoragePort() })
export abstract class StoragePort {
  abstract get(key: string): string | null;
  abstract set(key: string, value: string): void;
  abstract remove(key: string): void;
}

export class BrowserStoragePort extends StoragePort {
  get(key: string): string | null {
    try {
      return localStorage.getItem(key);
    } catch {
      return null;
    }
  }

  set(key: string, value: string): void {
    try {
      localStorage.setItem(key, value);
    } catch {
      // stockage indisponible : non bloquant
    }
  }

  remove(key: string): void {
    try {
      localStorage.removeItem(key);
    } catch {
      // stockage indisponible : non bloquant
    }
  }
}

export class MemoryStoragePort extends StoragePort {
  private readonly values = new Map<string, string>();

  get(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  set(key: string, value: string): void {
    this.values.set(key, value);
  }

  remove(key: string): void {
    this.values.delete(key);
  }
}

