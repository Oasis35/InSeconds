import { test, expect } from '../fixtures/test';
import { GamePage } from '../pages/game.page';
import { BlindRoundPage } from '../pages/blind-round.page';

// Piège 32 : une réponse envoyée pendant une coupure réseau n'est ni perdue ni comptée deux fois. L'adaptateur réessaie deux fois (une
// seconde entre chaque essai), puis la manche revient en « Réessayer » avec la saisie gardée, sans rien enregistrer ni montrer de faux
// résultat ; le réseau revenu, « Réessayer » renvoie la même réponse et le serveur ne la reçoit qu'une fois.
test.describe('Réponse envoyée hors connexion', () => {
  test.beforeEach(async ({ api }) => {
    await api.reseed();
  });

  test('la manche revient en « Réessayer » sans résultat, puis la réponse est enregistrée une seule fois', async ({ page, context }) => {
    // Chaque réponse que le serveur reçoit et traite : une requête qui échoue faute de réseau n'y figure pas.
    const received: number[] = [];
    page.on('response', response => {
      if (response.request().method() === 'POST' && /\/api\/daily\/sessions\/\d+\/answers$/.test(response.url())) received.push(response.status());
    });

    const game = new GamePage(page);
    const round = new BlindRoundPage(page);
    await game.startFirstRound(round, 0.5);

    await context.setOffline(true);
    await round.submitEmpty();

    // Les deux essais de plus attendent une seconde (horloge simulée) : on la fait avancer jusqu'à l'échec définitif.
    await expect(async () => {
      await page.clock.fastForward(1000);
      await expect(game.retryButton).toBeVisible({ timeout: 500 });
    }).toPass({ timeout: 15_000 });
    await expect(page.getByTestId('round-submit-error')).toBeVisible();
    // Aucun résultat : pas de points, pas de morceau suivant, et le serveur n'a rien reçu.
    await expect(round.nextButton).toBeHidden();
    await expect(round.roundScore).toBeHidden();
    expect(received).toEqual([]);

    await context.setOffline(false);
    await game.retryButton.click();

    expect(await round.readRoundScore()).toBe(0);
    await expect(game.retryButton).toBeHidden();
    expect(received).toEqual([200]);

    // La partie continue normalement : le morceau suivant se joue et la réponse du premier n'est pas repartie.
    await round.goNext();
    await round.playRound(1);
    expect(received).toEqual([200, 200]);
  });
});
