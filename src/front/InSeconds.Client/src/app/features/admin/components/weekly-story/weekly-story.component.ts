import { Component, ChangeDetectionStrategy, ChangeDetectorRef, ElementRef, inject, computed } from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import type { Options as Html2CanvasOptions } from 'html2canvas-pro';
import { AdminWeeklyStoryService, WeeklyStoryImage, WeeklyStoryKind } from '../../services/admin-weekly-story.service';
import { formatPercent, formatPeriod, hiResCover, sizeClass, storyFileName } from './weekly-story.format';

export type CaptureFn = (element: HTMLElement, options: Partial<Html2CanvasOptions>) => Promise<HTMLCanvasElement>;

// Chargé à la demande : html2canvas-pro (fork maintenu de html2canvas, ~270 Ko) ne doit pas peser sur le bundle principal.
const defaultCapture: CaptureFn = (element, options) =>
  import('html2canvas-pro').then(m => m.default(element, options));

const IMAGE_LOAD_TIMEOUT_MS = 5000;

/**
 * Section « Stories hebdo » de l'onglet Actions : bouton de génération + 2 gabarits 1080×1920
 * hors écran (plus trouvé + sticker musique, plus raté + sticker sondage), capturés en PNG
 * avec html2canvas-pro puis proposés en miniatures téléchargeables.
 */
@Component({
  selector: 'app-weekly-story',
  imports: [TranslatePipe, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './weekly-story.component.html',
  styleUrl: './weekly-story.component.scss',
})
export class WeeklyStoryComponent {
  protected readonly story = inject(AdminWeeklyStoryService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly cdr = inject(ChangeDetectorRef);

  /** Remplaçable en test. */
  captureFn: CaptureFn = defaultCapture;

  protected readonly period = computed(() => {
    const r = this.story.recap();
    return r ? formatPeriod(r.from, r.to) : '';
  });
  protected readonly found = computed(() => this.story.recap()?.mostFound ?? null);
  protected readonly missed = computed(() => this.story.recap()?.mostMissed ?? null);

  protected readonly formatPercent = formatPercent;
  protected readonly sizeClass = sizeClass;
  protected readonly hiResCover = hiResCover;

  async generate(): Promise<void> {
    if (this.story.busy()) return;
    if (!(await this.story.load())) return;
    await this.render();
  }

  /** Recapture à partir du récap déjà chargé (ex : après avoir coché/décoché les repères). */
  async render(): Promise<void> {
    const recap = this.story.recap();
    if (recap?.status !== 'ok') return;
    this.story.startRendering();
    try {
      // Les gabarits n'existent qu'une fois le récap affiché : rendu synchrone avant capture.
      this.cdr.detectChanges();
      await this.waitForAssets();

      const images: WeeklyStoryImage[] = [];
      for (const el of this.templates()) {
        const kind = el.dataset['story'] as WeeklyStoryKind;
        const canvas = await this.captureFn(el, {
          width: 1080,
          height: 1920,
          scale: 1,
          useCORS: true,
          backgroundColor: null,
          logging: false,
          onclone: (doc: Document) => {
            // La scène est hors écran (left:-10000px) : on la ramène dans le cadre sur le clone
            // que capture html2canvas, sinon l'image sort vide.
            const stage = doc.querySelector<HTMLElement>('[data-story-stage]');
            if (stage) stage.style.left = '0';
          },
        });
        images.push({ kind, dataUrl: canvas.toDataURL('image/png'), fileName: storyFileName(kind, recap.to) });
      }
      this.story.setImages(images);
    } catch {
      this.story.fail();
    }
    this.cdr.markForCheck();
  }

  toggleGuides(show: boolean): void {
    this.story.showGuides.set(show);
    if (this.story.status() === 'ready') void this.render();
  }

  downloadAll(): void {
    for (const img of this.story.images()) this.download(img);
  }

  download(img: WeeklyStoryImage): void {
    const a = document.createElement('a');
    a.href = img.dataUrl;
    a.download = img.fileName;
    a.click();
  }

  private templates(): HTMLElement[] {
    return Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('[data-story]'));
  }

  /** Polices (Poppins/Inter) et pochettes chargées avant capture, sinon html2canvas fige un rendu partiel. */
  private async waitForAssets(): Promise<void> {
    const fonts = document.fonts;
    if (fonts) {
      await Promise.all([
        fonts.load('800 64px Poppins'), fonts.load('700 36px Poppins'), fonts.load('600 44px Poppins'),
        fonts.load('400 30px Inter'), fonts.load('600 30px Inter'),
      ]).catch(() => undefined);
      await fonts.ready;
    }
    const imgs = Array.from(this.host.nativeElement.querySelectorAll<HTMLImageElement>('[data-story] img'));
    await Promise.all(imgs.map(img => img.complete ? Promise.resolve() : new Promise<void>(resolve => {
      const done = () => resolve();
      img.addEventListener('load', done, { once: true });
      img.addEventListener('error', done, { once: true });
      setTimeout(done, IMAGE_LOAD_TIMEOUT_MS);
    })));
  }
}
