import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// Configuration Vitest lue par le builder @angular/build:unit-test (option runnerConfig).
// Les tests tournent dans un vrai Chromium (mode navigateur Vitest, piloté par Playwright), comme
// en v1. `--autoplay-policy=no-user-gesture-required` sert aux tests de l'AudioPort (gameplay,
// piège 44) : sans lui, Chromium headless refuse tout audio.play().
// PLAYWRIGHT_CHROMIUM_PATH : Chromium déjà installé ailleurs (environnement sans
// `playwright install`) ; absent en CI, où Playwright utilise le sien.
export default defineConfig({
  test: {
    // Vitest ne restaure pas les vi.spyOn en fin de test sans cette option.
    restoreMocks: true,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({
        launchOptions: {
          executablePath: process.env['PLAYWRIGHT_CHROMIUM_PATH'] || undefined,
          args: ['--autoplay-policy=no-user-gesture-required'],
        },
      }),
      instances: [{ browser: 'chromium' }],
    },
  },
});
