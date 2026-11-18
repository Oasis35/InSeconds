import { ActivatedRouteSnapshot, RouterStateSnapshot } from '@angular/router';
import { DailyPage } from './daily/daily.page';
import { leaveGameGuard } from './leave-game.guard';

describe('leaveGameGuard', () => {
  const run = (playing: boolean, nextUrl: string, canLeave = true) => {
    const page = { isPlaying: () => playing, canLeave: vi.fn(() => canLeave) } as unknown as DailyPage;
    const next = { url: nextUrl } as RouterStateSnapshot;
    const result = leaveGameGuard(page, {} as ActivatedRouteSnapshot, {} as RouterStateSnapshot, next);
    return { result, page: page as unknown as { canLeave: ReturnType<typeof vi.fn> } };
  };

  it("en pleine manche, le retour à l'accueil est ignoré, sans confirmation", () => {
    const { result, page } = run(true, '/?utm_source=share');

    expect(result).toBe(false);
    expect(page.canLeave).not.toHaveBeenCalled();
  });

  it('en pleine manche, une autre sortie passe par la confirmation', () => {
    const { result, page } = run(true, '/account/login');

    expect(result).toBe(true);
    expect(page.canLeave).toHaveBeenCalled();
  });

  it("hors manche, rien n'est ignoré", () => {
    expect(run(false, '/').result).toBe(true);
  });
});
