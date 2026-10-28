import { EnvironmentInjector, Type, createEnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { ADMIN_API_BASE_URL, AdminClient } from '../../api/admin/api.generated';
import { CATALOGUE_API_BASE_URL, CatalogueClient } from '../../api/catalogue/api.generated';
import { DAILY_API_BASE_URL, DailyClient } from '../../api/daily/api.generated';
import { RUNS_API_BASE_URL, RunsClient } from '../../api/runs/api.generated';
import { environment } from '../../../environments/environment';
import { ActionsApi } from './actions.api';
import { JOBS_DASHBOARD_URL, provideAdminApi } from './admin-api.providers';
import { CatalogueApi } from './catalogue.api';
import { ChallengesApi } from './challenges.api';
import { DashboardApi } from './dashboard.api';
import { JobsApi } from './jobs.api';
import { AdminPlayersApi } from './players.api';
import { WeeklyStoryApi } from './weekly-story.api';

describe('provideAdminApi', () => {
  function routeInjector(): EnvironmentInjector {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    return createEnvironmentInjector(provideAdminApi(), TestBed.inject(EnvironmentInjector));
  }

  it("donne l'adresse de l'API aux clients des routes de l'admin, et celle du tableau des tâches", () => {
    const injector = routeInjector();

    for (const token of [ADMIN_API_BASE_URL, CATALOGUE_API_BASE_URL, DAILY_API_BASE_URL, RUNS_API_BASE_URL]) {
      expect(injector.get(token)).toBe(environment.apiUrl);
    }
    expect(injector.get(JOBS_DASHBOARD_URL)).toBe(`${environment.apiUrl}/jobs`);
  });

  it("redonne les clients, pour qu'ils lisent cette adresse et non celle de la racine, absente", () => {
    const injector = routeInjector();

    const clients: Type<unknown>[] = [AdminClient, CatalogueClient, DailyClient, RunsClient];
    for (const client of clients) {
      expect(injector.get(client)).not.toBe(TestBed.inject(client));
    }
  });

  it("fournit les adaptateurs de l'admin, qui ne sont pas des services de la racine", () => {
    const injector = routeInjector();

    const apis: Type<unknown>[] = [ActionsApi, CatalogueApi, ChallengesApi, DashboardApi, JobsApi, AdminPlayersApi, WeeklyStoryApi];
    for (const api of apis) {
      expect(injector.get(api)).toBeInstanceOf(api);
      expect(() => TestBed.inject(api)).toThrow();
    }
  });
});
