import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, effect, inject } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { filter, map } from 'rxjs';
import { ShellChromeStore } from '../../../core/shell/shell-chrome.store';
import { VersionService } from '../../../core/version/version.service';
import { TrackRoundStore } from '../../../gameplay/data-access/track-round.store';
import { DailyGameStore } from '../../data-access/daily-game.store';
import { DailyShare } from '../../data-access/daily-share';
import { GuestStreakNotice } from '../../data-access/guest-streak-notice';
import { LostStreakNotice } from '../../data-access/lost-streak-notice';
import { redirectFor } from '../../domain/daily-screen';
import { reloadMomentFor } from '../reload-moment';
import { DailyResultView, DailyStartup, StreakSheetOpener } from './daily-view';

/** Les écrans que la V4 montre sur l'accueil (`/`) : tout ce qui n'est pas la manche ni une erreur. */

/**
 * La coquille du jeu du jour : elle porte la partie (`DailyGameStore`, la manche, le partage) et laisse deux pages la montrer, l'accueil (`/`,
 * neutre : les cartes des modes) et le défi (`/daily`, la manche). Les stores vivent tant qu'on passe de l'une à l'autre : le son lancé d'un
 * toucher sur la carte de l'accueil continue sur la page de la manche, et le score qui monte suit la fin de la partie.
 * Elle décide aussi de la page qui montre quoi : sans la V4, la racine renvoie au défi ; avec elle, une manche est sur `/daily`, tout le reste sur `/`.
 */
@Component({
  selector: 'app-daily-shell',
  imports: [RouterOutlet],
  providers: [DailyGameStore, TrackRoundStore, DailyShare, LostStreakNotice, GuestStreakNotice, DailyStartup, StreakSheetOpener, DailyResultView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <router-outlet />

  `,
  host: {
    '(window:beforeunload)': 'onBeforeUnload($event)',
    '(document:visibilitychange)': 'onVisibilityChange()',
  },
})
export class DailyShellComponent implements OnInit {
  protected readonly store = inject(DailyGameStore);
  private readonly chrome = inject(ShellChromeStore);
  private readonly router = inject(Router);
  private readonly startup = inject(DailyStartup);
  private readonly destroyRef = inject(DestroyRef);

  private readonly path = toSignal(
    this.router.events.pipe(filter((event): event is NavigationEnd => event instanceof NavigationEnd), map(() => this.router.url.split(/[?#]/)[0])),
    { initialValue: this.router.url.split(/[?#]/)[0] },
  );

  constructor() {
    // La coque (barre du bas de la V4) sait si une manche est en cours et si le défi du jour est joué.
    effect(() => {
      const screen = this.store.screen();
      this.chrome.setImmersive(screen === 'playing');
      let done: boolean | null = null;
      if (screen === 'welcome' || screen === 'resume_prompt') done = false;
      else if (screen === 'already_played' || screen === 'done') done = true;
      this.chrome.setDailyDone(done);
    });
    // Quelle page montre quoi : une manche est sur `/daily`, le reste (carte du défi, pause, résultat, abandon) sur `/`.
    effect(() => {
      const target = redirectFor(this.path(), this.store.screen());
      if (target) this.goTo(target);
    });

    // Une nouvelle version du site ne recharge jamais la page en pleine manche (cf. `reloadMomentFor`).
    inject(VersionService).allowReload(() => reloadMomentFor(this.store.screen()), this.destroyRef);
  }

  ngOnInit(): void {
    void this.startup.run();
  }

  protected onVisibilityChange(): void {
    if (document.visibilityState === 'visible') this.store.refresh();
  }

  protected onBeforeUnload(event: BeforeUnloadEvent): void {
    if (this.store.screen() === 'playing') event.preventDefault();
  }

  private goTo(url: string): void {
    void this.router.navigate([url], { queryParamsHandling: 'preserve', replaceUrl: true });
  }
}
