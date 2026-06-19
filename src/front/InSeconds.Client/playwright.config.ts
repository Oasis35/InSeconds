import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  workers: 1,
  reporter: process.env['CI']
    ? [['github'], ['html', { open: 'never' }]]
    : 'list',

  use: {
    // CI utilise 5173 (port standard), local utilise 5174 (évite le conflit avec le dev normal)
    baseURL: process.env['CI'] ? 'http://localhost:5173' : 'http://localhost:5174',
    trace: 'on-first-retry',
    video: 'on-first-retry',
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
          command: 'dotnet run --project ../../back/InSeconds.Api/InSeconds.Api.csproj --urls http://localhost:5172',
          url: 'http://localhost:5172/health',
          timeout: 90_000,
          reuseExistingServer: true,
          env: {
            ASPNETCORE_ENVIRONMENT: 'Testing',
            ConnectionStrings__DefaultConnection:
              'Host=localhost;Port=5432;Database=inseconds_e2e;Username=inseconds;Password=inseconds_e2e',
            AdminPassword: 'e2e-admin-password',
          },
        },
        {
          command: 'npx ng serve --configuration e2e --port 5174',
          url: 'http://localhost:5174',
          timeout: 90_000,
          reuseExistingServer: true,
        },
      ],
});
