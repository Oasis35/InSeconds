import { computed, inject } from '@angular/core';
import { patchState, signalStore, withComputed, withMethods, withState } from '@ngrx/signals';
import { toAppError } from '../../core/errors/app-error';
import { setError, setFulfilled, setPending, withRequestStatus } from '../../core/store/with-request-status';
import {
  StoryImage, TitleMode, WeeklyRecap, clampCustomTitle, defaultPeriod, isPeriodValid, storyTitle,
} from '../domain/weekly-story';
import { WeeklyStoryApi } from './weekly-story.api';

/** Où en est la génération : lecture du récap, capture des images, prêt, pas assez de réponses, ou échec. */
export type WeeklyStoryStatus = 'idle' | 'loading' | 'rendering' | 'ready' | 'insufficient' | 'error';

type RenderStage = 'idle' | 'rendering' | 'ready' | 'failed';

interface WeeklyStoryState {
  recap: WeeklyRecap | null;
  images: readonly StoryImage[];
  stage: RenderStage;
  /** Pointillés indiquant où poser les stickers Instagram (musique, sondage, lien). */
  showGuides: boolean;
  /** Pourcentage de réussite (et sa légende) sous le titre du morceau. */
  showPercent: boolean;
  /** Période demandée (`aaaa-mm-jj`, jours de défi UTC), prise en compte au prochain « Générer ». */
  from: string;
  to: string;
  titleMode: TitleMode;
  customTitle: string;
}

/**
 * Stories Instagram hebdo (onglet Actions) : lit le récap de la période et garde les options et les PNG.
 * La capture elle-même (DOM → image) est faite par le composant, qui possède les gabarits 1080×1920 ;
 * le store enregistre ses étapes (`startRendering`, `setImages`, `failRendering`).
 */
export const WeeklyStoryStore = signalStore(
  withRequestStatus(),
  withState<WeeklyStoryState>(() => ({
    recap: null, images: [], stage: 'idle', showGuides: true, showPercent: true,
    ...defaultPeriod(new Date()), titleMode: 'thisWeek', customTitle: '',
  })),
  withComputed(({ isPending, error, recap, stage, from, to, titleMode, customTitle }) => {
    const status = computed<WeeklyStoryStatus>(() => {
      if (isPending()) return 'loading';
      if (error() !== null || stage() === 'failed') return 'error';
      if (stage() === 'rendering') return 'rendering';
      if (recap()?.status === 'insufficient') return 'insufficient';
      return stage() === 'ready' ? 'ready' : 'idle';
    });
    return {
      status,
      busy: computed(() => status() === 'loading' || status() === 'rendering'),
      periodValid: computed(() => isPeriodValid(from(), to())),
      title: computed(() => storyTitle(titleMode(), customTitle())),
    };
  }),
  withMethods((store, api = inject(WeeklyStoryApi)) => ({
    setShowGuides: (showGuides: boolean) => patchState(store, { showGuides }),
    setShowPercent: (showPercent: boolean) => patchState(store, { showPercent }),
    setFrom: (from: string) => patchState(store, { from }),
    setTo: (to: string) => patchState(store, { to }),
    setTitleMode: (titleMode: TitleMode) => patchState(store, { titleMode }),
    setCustomTitle: (text: string) => patchState(store, { customTitle: clampCustomTitle(text) }),

    /** Lit le récap de la période. Rend vrai s'il y a de quoi faire les stories (la capture suit alors). */
    async load(): Promise<boolean> {
      patchState(store, setPending(), { images: [], stage: 'idle' });
      try {
        const recap = await api.getRecap(store.from(), store.to());
        patchState(store, { recap }, setFulfilled());
        if (recap.status !== 'ok' || recap.mostFound === null) return false;
        patchState(store, { stage: 'rendering' });
        return true;
      } catch (error) {
        patchState(store, { recap: null }, setError(await toAppError(error)));
        return false;
      }
    },

    startRendering: () => patchState(store, { images: [], stage: 'rendering' }),
    setImages: (images: readonly StoryImage[]) => patchState(store, { images, stage: 'ready' }),
    failRendering: () => patchState(store, { stage: 'failed' }),
  })),
);
