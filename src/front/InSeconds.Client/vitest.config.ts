import { playwright } from '@vitest/browser-playwright';
import { defineConfig } from 'vitest/config';

// Configuration Vitest lue par le builder @angular/build:unit-test (option runnerConfig).
// Les tests tournent dans un vrai Chromium (mode navigateur Vitest, piloté par Playwright) :
// AudioPlayerService est testé avec un vrai <audio>. Sans --autoplay-policy=no-user-gesture-required,
// Chromium headless refuse tout audio.play() (NotAllowedError) et ces tests ne vérifieraient
// aucune lecture réelle (cf. piège 44 CLAUDE.md).
export default defineConfig({
  test: {
    // Jasmine restaurait automatiquement chaque spyOn en fin de test ; Vitest non. Sans ça, un
    // vi.spyOn sur un prototype (HTMLMediaElement.play, console.error…) fuirait dans les tests suivants.
    restoreMocks: true,
    browser: {
      enabled: true,
      headless: true,
      provider: playwright({
        launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
      }),
      instances: [{ browser: 'chromium' }],
    },
  },
});
