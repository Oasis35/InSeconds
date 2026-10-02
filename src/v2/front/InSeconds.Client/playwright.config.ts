import { defineConfig, devices } from '@playwright/test';
import disabledSpecs from './e2e/disabled-specs.json';

// E2E copiés de la v1 (PR A5), désactivés tant que la fonctionnalité n'existe pas en v2 :
// e2e/disabled-specs.json liste chaque spec avec la PR qui le réactive (liste vide au jalon J4).
// Réactiver un spec = retirer sa ligne. E2E_INCLUDE_DISABLED=1 les remet dans la liste : c'est ce
// que fait le check CI de parité v1/v2 (scripts/check-e2e-parity.mjs, E8).
const disabled = process.env['E2E_INCLUDE_DISABLED'] ? [] : Object.keys(disabledSpecs);
const e2eDbConnection = process.env['E2E_DB_CONNECTION'];

export default defineConfig({
  testDir: './e2e',
  testIgnore: disabled.map((spec) => `**/specs/${spec}`),
  timeout: process.env['CI'] ? 60_000 : 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: 1,
  reporter: process.env['CI']
    ? [['github'], ['html', { open: 'never' }]]
    : 'list',

  use: {
    // Front v2 : 5176 en CI (port par défaut d'ng serve), 5178 en local (évite le conflit avec le dev normal)
    baseURL: process.env['CI'] ? 'http://localhost:5176' : 'http://localhost:5178',
    // E12 : le service worker de la PWA ne doit jamais servir une page ou intercepter une requête des E2E.
    serviceWorkers: 'block',
    trace: 'on-first-retry',
    video: 'on-first-retry',
    // Désactive les animations (ex: count-up du score) — sinon le score final n'est pas
    // lisible sous une horloge figée par page.clock (requestAnimationFrame ne tourne pas).
    reducedMotion: 'reduce',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        permissions: ['clipboard-read', 'clipboard-write'],
        launchOptions: {
          args: [
            '--autoplay-policy=no-user-gesture-required',
          ],
        },
      },
    },
  ],

  webServer: process.env['CI']
    ? undefined
    : [
        {
          // Hôte de test de l'API v2 (InSeconds.Api.Testing : /api/e2e/*, faux email, dev-login).
          command: 'dotnet run --project ../../back/InSeconds.Api.Testing/InSeconds.Api.Testing.csproj --urls http://localhost:5177',
          url: 'http://localhost:5177/health',
          timeout: 90_000,
          reuseExistingServer: true,
          // Base dédiée aux E2E : chaîne de connexion à fournir par E2E_DB_CONNECTION (aucun mot de
          // passe dans le dépôt), sinon celle de l'appsettings de l'API.
          env: {
            ASPNETCORE_ENVIRONMENT: 'Testing',
            ...(e2eDbConnection ? { ConnectionStrings__DefaultConnection: e2eDbConnection } : {}),
          },
        },
        {
          command: 'npx ng serve --configuration e2e --port 5178',
          url: 'http://localhost:5178',
          timeout: 90_000,
          reuseExistingServer: true,
        },
      ],
});
