import { test as base } from '@playwright/test';
import { ApiTestClient } from './api-client';

type E2EFixtures = {
  api: ApiTestClient;
};

export const test = base.extend<E2EFixtures>({
  api: async ({}, use) => {
    await use(new ApiTestClient());
  },
});

export { expect } from '@playwright/test';
