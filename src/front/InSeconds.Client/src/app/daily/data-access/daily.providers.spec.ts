import { EnvironmentInjector, createEnvironmentInjector } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { DAILY_API_BASE_URL, DailyClient } from '../../api/daily/api.generated';
import { environment } from '../../../environments/environment';
import { DailyApi } from './daily.api';
import { provideDailyApi } from './daily.providers';

describe('provideDailyApi', () => {
  function routeInjector(): EnvironmentInjector {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    return createEnvironmentInjector(provideDailyApi(), TestBed.inject(EnvironmentInjector));
  }

  it("donne l'adresse de l'API au client de la route, et non à celui de la racine, qui ne l'a pas", () => {
    const injector = routeInjector();

    expect(injector.get(DAILY_API_BASE_URL)).toBe(environment.apiUrl);
    expect(injector.get(DailyClient)).not.toBe(TestBed.inject(DailyClient));
  });

  it("fournit l'adaptateur, qui n'est pas un service de la racine", () => {
    const injector = routeInjector();

    expect(injector.get(DailyApi)).toBeInstanceOf(DailyApi);
    expect(() => TestBed.inject(DailyApi)).toThrow();
  });
});
