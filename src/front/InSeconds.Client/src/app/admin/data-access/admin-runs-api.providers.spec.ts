import { EnvironmentInjector, createEnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { RUNS_API_BASE_URL, RunsClient } from '../../api/runs/api.generated';
import { environment } from '../../../environments/environment';
import { provideAdminRunsApi } from './admin-runs-api.providers';
import { AdminPlayersApi } from './players.api';

describe('provideAdminRunsApi', () => {
  function routeInjector(): EnvironmentInjector {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    return createEnvironmentInjector(provideAdminRunsApi(), TestBed.inject(EnvironmentInjector));
  }

  it("donne l'adresse de l'API au client du mode Run des routes de l'admin", () => {
    const injector = routeInjector();

    expect(injector.get(RUNS_API_BASE_URL)).toBe(environment.apiUrl);
    expect(injector.get(RunsClient)).not.toBe(TestBed.inject(RunsClient));
  });

  it("redonne l'adaptateur des joueurs, pour qu'il reçoive ce client et non celui de la racine", () => {
    const injector = routeInjector();

    expect(injector.get(AdminPlayersApi)).not.toBe(TestBed.inject(AdminPlayersApi));
  });
});
