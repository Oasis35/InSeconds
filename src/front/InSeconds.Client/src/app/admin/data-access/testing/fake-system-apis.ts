import { Provider } from '@angular/core';
import { CatalogueHealth, CiRun, NextChallenge, SystemInfo } from '../../domain/system';
import { GithubCiApi } from '../github-ci.api';
import { SystemApi } from '../system.api';

/** Ce que l'API du faux dit d'elle-même : un commit, une sauvegarde partie sur R2. */
export const FAKE_SYSTEM_INFO: SystemInfo = { commit: '4f2a9c1d8e7b6a5f', lastBackupAt: '2026-11-04T03:00:41Z', lastBackupOffSite: true };

/** Un pool sans souci, et un défi de demain prêt. */
export const FAKE_CATALOGUE_HEALTH: CatalogueHealth = { missingPreviewCount: 0, missingWaveformCount: 0 };
export const FAKE_NEXT_CHALLENGE: NextChallenge = { date: '2026-11-05', eligibleCount: 212, requiredCount: 5, generated: false };

function systemDefaults() {
  return {
    getInfo: vi.fn<() => Promise<SystemInfo>>(() => Promise.resolve(FAKE_SYSTEM_INFO)),
    getCatalogueHealth: vi.fn<() => Promise<CatalogueHealth>>(() => Promise.resolve(FAKE_CATALOGUE_HEALTH)),
    getNextChallenge: vi.fn<() => Promise<NextChallenge>>(() => Promise.resolve(FAKE_NEXT_CHALLENGE)),
  } satisfies Record<keyof SystemApi, unknown>;
}

function githubDefaults() {
  return {
    latestRun: vi.fn<(branch: string) => Promise<CiRun | null>>(branch =>
      Promise.resolve({ branch, headSha: FAKE_SYSTEM_INFO.commit ?? '', state: 'success', url: `https://github.test/${branch}` })),
  } satisfies Partial<Record<keyof GithubCiApi, unknown>>;
}

export type FakeSystemApi = ReturnType<typeof systemDefaults>;
export type FakeGithubCiApi = ReturnType<typeof githubDefaults>;

export function fakeSystemApi(overrides: Partial<FakeSystemApi> = {}): FakeSystemApi {
  return { ...systemDefaults(), ...overrides };
}

/** Faux `GithubCiApi` : chaque branche a passé sa CI sur le commit du faux `SystemApi`. */
export function fakeGithubCiApi(overrides: Partial<FakeGithubCiApi> = {}): FakeGithubCiApi {
  return { ...githubDefaults(), ...overrides };
}

export function provideSystemApisFake(system: FakeSystemApi = fakeSystemApi(), github: FakeGithubCiApi = fakeGithubCiApi()): Provider[] {
  return [{ provide: SystemApi, useValue: system }, { provide: GithubCiApi, useValue: github }];
}
