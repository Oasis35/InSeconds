import { Injectable, inject, signal, computed } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminHttpService } from './admin-http.service';
import { WeeklyRecapResponse } from '../admin.models';

export type WeeklyStoryStatus = 'idle' | 'loading' | 'rendering' | 'ready' | 'insufficient' | 'error';
export type WeeklyStoryKind = 'found' | 'missed';

export interface WeeklyStoryImage {
  kind: WeeklyStoryKind;
  dataUrl: string;
  fileName: string;
}

/**
 * Stories Instagram hebdo (onglet Actions) : récupère le récap des 7 derniers jours et garde
 * les PNG générés. La capture elle-même (DOM → canvas) vit dans WeeklyStoryComponent, qui
 * possède les gabarits 1080×1920.
 */
@Injectable()
export class AdminWeeklyStoryService {
  private readonly http = inject(AdminHttpService);

  readonly status = signal<WeeklyStoryStatus>('idle');
  readonly recap = signal<WeeklyRecapResponse | null>(null);
  readonly images = signal<WeeklyStoryImage[]>([]);
  /** Pointillés indiquant où poser les stickers Instagram (musique / sondage). */
  readonly showGuides = signal(true);

  readonly busy = computed(() => this.status() === 'loading' || this.status() === 'rendering');

  /** Charge le récap. Renvoie true s'il y a de quoi générer les stories. */
  async load(): Promise<boolean> {
    this.status.set('loading');
    this.images.set([]);
    try {
      const recap = await firstValueFrom(this.http.getWeeklyRecap());
      this.recap.set(recap);
      if (recap.status !== 'ok' || !recap.mostFound) {
        this.status.set('insufficient');
        return false;
      }
      this.status.set('rendering');
      return true;
    } catch {
      this.recap.set(null);
      this.status.set('error');
      return false;
    }
  }

  startRendering(): void {
    this.status.set('rendering');
    this.images.set([]);
  }

  setImages(images: WeeklyStoryImage[]): void {
    this.images.set(images);
    this.status.set('ready');
  }

  fail(): void {
    this.status.set('error');
  }
}
