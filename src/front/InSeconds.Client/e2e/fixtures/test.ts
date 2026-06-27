import { test as base } from '@playwright/test';
import { ApiTestClient } from './api-client';

type E2EFixtures = {
  api: ApiTestClient;
};

export const test = base.extend<E2EFixtures>({
  api: async ({}, use) => {
    await use(new ApiTestClient());
  },

  // Flags de test posés avant le chargement de l'app, pour tous les specs :
  //  - __disableAnimations : coupe le count-up du score (requestAnimationFrame ne tourne
  //    pas sous une horloge figée par page.clock → le score final ne s'afficherait jamais).
  //  - __disableHealthPolling : coupe le polling /health (les sauts d'horloge cumulent les
  //    ticks et switchMap annule les requêtes en vol, ce qui déclencherait un faux overlay
  //    "Service indisponible"). Le spec service-down.spec.ts le réactive explicitement.
  page: async ({ page }, use) => {
    await page.addInitScript(() => {
      (window as { __disableAnimations?: boolean }).__disableAnimations = true;
      (window as { __disableHealthPolling?: boolean }).__disableHealthPolling = true;
    });
    await use(page);
  },
});

export { expect } from '@playwright/test';
