import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { DailyPage } from './daily/daily.page';
import { leaveGameGuard } from './leave-game.guard';

describe('leaveGameGuard', () => {
  const run = (nextUrl: string, canLeave: boolean | Promise<boolean> = true) => {
    const page = { canLeave: vi.fn(() => canLeave) } as unknown as DailyPage;
    const next = { url: nextUrl } as RouterStateSnapshot;
    const result = leaveGameGuard(page, {} as ActivatedRouteSnapshot, {} as RouterStateSnapshot, next);
    return { result, page: page as unknown as { canLeave: ReturnType<typeof vi.fn> } };
  };

  it("quitter vers l'accueil (logo, retour arrière) passe par la confirmation, comme toute autre sortie", () => {
    const { result, page } = run('/?utm_source=share');

    expect(result).toBe(true);
    expect(page.canLeave).toHaveBeenCalled();
  });

  it('une sortie refusée garde le joueur sur la manche', () => {
    expect(run('/account/login', false).result).toBe(false);
  });

  it('une sortie confirmée laisse partir (la carte de reprise attend sur l\'accueil)', async () => {
    expect(await run('/', Promise.resolve(true)).result).toBe(true);
  });
});
