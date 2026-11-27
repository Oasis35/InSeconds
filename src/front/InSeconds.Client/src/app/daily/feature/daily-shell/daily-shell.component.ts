import { isPlatformBrowser } from '@angular/common';
import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, PLATFORM_ID, effect, inject } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { ShellChromeStore } from '../../../core/shell/shell-chrome.store';
import { VersionService } from '../../../core/version/version.service';
import { HomeStore } from '../../data-access/home.store';
import { DailyShare } from '../../data-access/daily-share';
import { GuestStreakNotice } from '../../data-access/guest-streak-notice';
import { LostStreakNotice } from '../../data-access/lost-streak-notice';
import { reloadMomentFor } from '../reload-moment';
import { DailyLauncher } from './daily-launcher';
import { DailyResultView, DailyStartup, StreakSheetOpener } from './daily-view';

/**
 * La coquille du jeu du jour : elle porte l'état du jour (`HomeStore`, le partage, les notices de série) et laisse deux pages le montrer ou le
 * jouer, l'accueil (`/`, les cartes des modes) et la manche (`/daily`, chargée à la demande avec le lecteur, qui a ses propres stores). Les
 * stores de la coque vivent tant qu'on passe de l'une à l'autre : la manche rend sa fin à l'accueil (`HomeStore.finishGame`), qui la lit chez lui.
 * Elle ne décide plus de la page qui montre quoi : c'est la manche qui rend la main à l'accueil quand il n'y a plus rien à jouer, et `/daily` sans
 * clic renvoie sur `/` (`startIntentGuard`).
 */
@Component({
  selector: 'app-daily-shell',
  imports: [RouterOutlet],
  providers: [HomeStore, DailyShare, LostStreakNotice, GuestStreakNotice, DailyLauncher, DailyStartup, StreakSheetOpener, DailyResultView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <router-outlet />

  `,
  host: {
    '(document:visibilitychange)': 'onVisibilityChange()',
  },
})
export class DailyShellComponent implements OnInit {
  protected readonly store = inject(HomeStore);
  private readonly chrome = inject(ShellChromeStore);
  private readonly router = inject(Router);
  private readonly startup = inject(DailyStartup);
  private readonly launcher = inject(DailyLauncher);
  private readonly destroyRef = inject(DestroyRef);
  private readonly isBrowser = isPlatformBrowser(inject(PLATFORM_ID));

  private readonly path = toSignal(
    this.router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd), map(() => this.router.url.split(/[?#]/)[0])),
    { initialValue: this.router.url.split(/[?#]/)[0] },
  );

  constructor() {
    // La coque (barre du bas de la V4) sait si le défi du jour est joué (la page de la manche pose `immersive`).
    effect(() => {
      const screen = this.store.screen();
      let done: boolean | null = null;
      if (screen === 'welcome' || screen === 'resume_prompt') done = false;
      else if (screen === 'already_played' || screen === 'done') done = true;
      this.chrome.setDailyDone(done);
    });
    // Une nouvelle version du site ne recharge jamais la page en pleine manche (cf. `reloadMomentFor`).
    inject(VersionService).allowReload(() => {
      if (this.path() === '/daily') return 'navigation';
      return this.launcher.starting() ? 'background' : reloadMomentFor(this.store.screen());
    }, this.destroyRef);
  }

  ngOnInit(): void {
    // Prérendu (construction) : pas de joueur, pas d'API ; l'accueil reste sur son écran d'attente, le navigateur lit l'état du jour.
    if (!this.isBrowser) return;
    void this.startup.run();
  }

  /** Retour de l'onglet sur l'accueil : l'état du jour est relu (en pleine manche, c'est la page de la manche qui le fait). */
  protected onVisibilityChange(): void {
    if (document.visibilityState === 'visible' && this.path() !== '/daily') this.store.refresh();
  }
}
