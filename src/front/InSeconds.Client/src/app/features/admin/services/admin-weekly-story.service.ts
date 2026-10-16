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

  private readonly _status = signal<WeeklyStoryStatus>('idle');
  readonly status = this._status.asReadonly();
  private readonly _recap = signal<WeeklyRecapResponse | null>(null);
  readonly recap = this._recap.asReadonly();
  private readonly _images = signal<WeeklyStoryImage[]>([]);
  readonly images = this._images.asReadonly();
  /** Pointillés indiquant où poser les stickers Instagram (musique / sondage). */
  private readonly _showGuides = signal(true);
  readonly showGuides = this._showGuides.asReadonly();
  /** Pourcentage de réussite (et sa légende) sous le titre du morceau. */
  private readonly _showPercent = signal(true);
  readonly showPercent = this._showPercent.asReadonly();
  /** Période du récap (yyyy-MM-dd, jours de défi UTC) — par défaut les 7 derniers jours. */
  private readonly _from = signal(utcDate(6));
  readonly from = this._from.asReadonly();
  private readonly _to = signal(utcDate(0));
  readonly to = this._to.asReadonly();
  private readonly _titleMode = signal<WeeklyStoryTitleMode>('thisWeek');
  readonly titleMode = this._titleMode.asReadonly();
  private readonly _customTitle = signal('');
  readonly customTitle = this._customTitle.asReadonly();

  /** Période saisie exploitable (dates remplies, début ≤ fin — format yyyy-MM-dd comparable en texte). */
  readonly periodValid = computed(() => !!this.from() && !!this.to() && this.from() <= this.to());
  readonly storyTitle = computed(() => {
    const mode = this.titleMode();
    return mode === 'custom' ? this.customTitle().trim() : PRESET_TITLES[mode];
  });

  readonly busy = computed(() => this.status() === 'loading' || this.status() === 'rendering');

  setShowGuides(show: boolean): void { this._showGuides.set(show); }
  setShowPercent(show: boolean): void { this._showPercent.set(show); }
  setTitleMode(mode: WeeklyStoryTitleMode): void { this._titleMode.set(mode); }
  setCustomTitle(text: string): void { this._customTitle.set(text.slice(0, CUSTOM_TITLE_MAX_LENGTH)); }
  setFrom(value: string): void { this._from.set(value); }
  setTo(value: string): void { this._to.set(value); }

  /** Charge le récap. Renvoie true s'il y a de quoi générer les stories. */
  async load(): Promise<boolean> {
    this._status.set('loading');
    this._images.set([]);
    try {
      const recap = await firstValueFrom(this.http.getWeeklyRecap(this.from(), this.to()));
      this._recap.set(recap);
      if (recap.status !== 'ok' || !recap.mostFound) {
        this._status.set('insufficient');
        return false;
      }
      this._status.set('rendering');
      return true;
    } catch {
      this._recap.set(null);
      this._status.set('error');
      return false;
    }
  }

  startRendering(): void {
    this._status.set('rendering');
    this._images.set([]);
  }

  setImages(images: WeeklyStoryImage[]): void {
    this._images.set(images);
    this._status.set('ready');
  }

  fail(): void {
    this._status.set('error');
  }
}
