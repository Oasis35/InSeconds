import { Injectable } from '@angular/core';

export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920;

/**
 * Port de la capture d'une story : transforme un élément du DOM de 1080×1920 en PNG (adresse `data:`).
 * Le vrai rendu passe par `html2canvas-pro`, chargé à la demande ; les specs en donnent un faux.
 */
@Injectable({ providedIn: 'root', useFactory: () => new Html2CanvasStoryRenderer() })
export abstract class StoryRenderer {
  /** Attend les polices de la DA, sans quoi la capture fige un rendu partiel. */
  abstract prepare(): Promise<void>;
  abstract capture(element: HTMLElement): Promise<string>;
}

export class Html2CanvasStoryRenderer extends StoryRenderer {
  async prepare(): Promise<void> {
    const fonts = document.fonts;
    if (!fonts) return;
    await Promise.all([
      fonts.load('800 64px Poppins'), fonts.load('700 36px Poppins'), fonts.load('600 44px Poppins'),
      fonts.load('400 30px Inter'), fonts.load('600 30px Inter'),
    ]).catch(() => undefined);
    await fonts.ready;
  }

  async capture(element: HTMLElement): Promise<string> {
    // Chargé à la demande : html2canvas-pro (~270 Ko) ne doit pas peser sur le chunk de l'admin.
    const { default: html2canvas } = await import('html2canvas-pro');
    const canvas = await html2canvas(element, {
      width: STORY_WIDTH,
      height: STORY_HEIGHT,
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
    return canvas.toDataURL('image/png');
  }
}
