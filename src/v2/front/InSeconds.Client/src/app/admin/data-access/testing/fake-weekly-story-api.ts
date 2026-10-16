import { Provider } from '@angular/core';
import { WeeklyRecap, WeeklyTrack } from '../../domain/weekly-story';
import { StoryRenderer } from '../story-renderer';
import { WeeklyStoryApi } from '../weekly-story.api';

export function weeklyTrack(overrides: Partial<WeeklyTrack> = {}): WeeklyTrack {
  return { artist: 'Daft Punk', title: 'One More Time', successRatePercent: 87, answers: 23, ...overrides };
}

export function weeklyRecap(overrides: Partial<WeeklyRecap> = {}): WeeklyRecap {
  return {
    status: 'ok', from: '2026-09-21', to: '2026-09-27', minAnswers: 3,
    mostFound: weeklyTrack(), mostMissed: weeklyTrack({ artist: 'Stromae', title: 'Alors on danse', successRatePercent: 8 }),
    ...overrides,
  };
}

function defaults() {
  return {
    getRecap: vi.fn<(from: string, to: string) => Promise<WeeklyRecap>>(() => Promise.resolve(weeklyRecap())),
  } satisfies Record<keyof WeeklyStoryApi, unknown>;
}

export type FakeWeeklyStoryApi = ReturnType<typeof defaults>;

/** Faux `WeeklyStoryApi` : rend un récap complet par défaut. */
export function fakeWeeklyStoryApi(overrides: Partial<FakeWeeklyStoryApi> = {}): FakeWeeklyStoryApi {
  return { ...defaults(), ...overrides };
}

export function provideWeeklyStoryApiFake(api: FakeWeeklyStoryApi): Provider {
  return { provide: WeeklyStoryApi, useValue: api };
}

function rendererDefaults() {
  return {
    prepare: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    capture: vi.fn<(element: HTMLElement) => Promise<string>>(() => Promise.resolve('data:image/png;base64,AAAA')),
  } satisfies Record<keyof StoryRenderer, unknown>;
}

export type FakeStoryRenderer = ReturnType<typeof rendererDefaults>;

/** Faux `StoryRenderer` : aucune capture réelle (html2canvas-pro n'est jamais chargé), un PNG minimal. */
export function fakeStoryRenderer(overrides: Partial<FakeStoryRenderer> = {}): FakeStoryRenderer {
  return { ...rendererDefaults(), ...overrides };
}

export function provideStoryRendererFake(renderer: FakeStoryRenderer): Provider {
  return { provide: StoryRenderer, useValue: renderer };
}
