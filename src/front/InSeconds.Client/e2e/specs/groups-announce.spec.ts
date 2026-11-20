import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';
import { RunPage } from '../pages/run.page';

// L'annonce des groupes : une carte au-dessus du défi ; la croix la remplace par la pastille de la carte amis et un point sur l'onglet Groupes, que
// l'ouverture de l'onglet Groupes éteint. Tout reste dans le navigateur.

test.describe("Accueil : l'annonce des groupes", () => {
  test.beforeEach(async ({ page, api }) => {
    await api.reset();
    // Les autres parcours la ferment d'office (fixture, script enregistré avant celui-ci) : ici elle est remise à neuf une seule fois par onglet
    // (le `sessionStorage` survit au rechargement), pour que la croix reste fermée après `reload()`.
    await page.addInitScript(() => {
      try {
        if (sessionStorage.getItem('e2e.announceReset')) return;
        sessionStorage.setItem('e2e.announceReset', '1');
        localStorage.removeItem('inseconds.announce.groups.closed');
        localStorage.removeItem('inseconds.announce.groups.rankingSeen');
      } catch { /* stockage indisponible - ignore */ }
    });
  });

  test("un invité : la carte, puis la croix la remplace par la pastille et le point, qui s'éteint avec l'onglet Groupes", async ({ page }) => {
    const game = new GamePage(page);
    await game.goto();
    await game.waitForWelcome();

    const card = page.getByTestId('groups-announce');
    await expect(card).toHaveAttribute('data-variant', 'guest');
    await card.getByTestId('groups-announce-close').click();
    await expect(card).toHaveCount(0);
    await expect(page.getByTestId('friends-card-new')).toBeVisible();
    await expect(page.getByTestId('ranking-new')).toBeVisible();

    // Fermée pour de bon : rien ne revient au rechargement.
    await page.reload();
    await game.waitForWelcome();
    await expect(page.getByTestId('groups-announce')).toHaveCount(0);
    await expect(page.getByTestId('friends-card-new')).toBeVisible();

    await page.getByTestId('tab-ranking').click();
    await expect(page).toHaveURL(/\/ranking/);
    await expect(page.getByTestId('ranking-new')).toHaveCount(0);
  });

  test("un compte sans groupe : « Créer un groupe » de la carte ouvre la création", async ({ page }) => {
    await new RunPage(page).loginAsPlayer('nina-annonce@e2e.test', 'NinaAnnonce');
    const game = new GamePage(page);
    await game.goto();
    await game.waitForWelcome();

    const card = page.getByTestId('groups-announce');
    await expect(card).toHaveAttribute('data-variant', 'no_group');
    await card.getByTestId('groups-announce-action').click();
    await expect(page).toHaveURL(/\/ranking\/new$/);
  });
});
