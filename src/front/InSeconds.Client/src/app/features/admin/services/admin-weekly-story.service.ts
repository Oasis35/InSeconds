import { Injectable, inject, signal, computed } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { AdminHttpService } from './admin-http.service';
import { WeeklyRecapResponse } from '../admin.models';

export type WeeklyStoryStatus = 'idle' | 'loading' | 'rendering' | 'ready' | 'insufficient' | 'error';
export type WeeklyStoryKind = 'found' | 'missed';
export type WeeklyStoryTitleMode = 'thisWeek' | 'lastWeek' | 'custom';

export const CUSTOM_TITLE_MAX_LENGTH = 50;

// Titre écrit dans les images : toujours en français (public Instagram).
const PRESET_TITLES: Record<Exclude<WeeklyStoryTitleMode, 'custom'>, string> = {
  thisWeek: 'Cette semaine dans InSeconds 🎧',
  lastWeek: 'La semaine dernière dans InSeconds 🎧',
};

/** yyyy-MM-dd (UTC), `daysAgo` jours avant aujourd'hui. */
function utcDate(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

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
  /** Pourcentage de réussite (et sa légende) sous le titre du morceau. */
  readonly showPercent = signal(true);
  /** Période du récap (yyyy-MM-dd, jours de défi UTC) — par défaut les 7 derniers jours. */
  readonly from = signal(utcDate(6));
  readonly to = signal(utcDate(0));
  readonly titleMode = signal<WeeklyStoryTitleMode>('thisWeek');
  readonly customTitle = signal('');

  /** Période saisie exploitable (dates remplies, début ≤ fin — format yyyy-MM-dd comparable en texte). */
  readonly periodValid = computed(() => !!this.from() && !!this.to() && this.from() <= this.to());
  readonly storyTitle = computed(() => {
    const mode = this.titleMode();
    return mode === 'custom' ? this.customTitle().trim() : PRESET_TITLES[mode];
  });

  readonly busy = computed(() => this.status() === 'loading' || this.status() === 'rendering');

  /** Charge le récap. Renvoie true s'il y a de quoi générer les stories. */
  async load(): Promise<boolean> {
    this.status.set('loading');
    this.images.set([]);
    try {
      const recap = await firstValueFrom(this.http.getWeeklyRecap(this.from(), this.to()));
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
