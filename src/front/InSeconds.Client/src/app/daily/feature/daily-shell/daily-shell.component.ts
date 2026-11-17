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
import { DailyScreen } from '../../domain/daily-screen';
import { GelEarnedToastComponent } from '../../ui/gel-earned-toast/gel-earned-toast.component';
import { GelUsedToastComponent } from '../../ui/gel-used-toast/gel-used-toast.component';
import { GuestStreakToastComponent } from '../../ui/guest-streak-toast/guest-streak-toast.component';
import { LostStreakToastComponent } from '../../ui/lost-streak-toast/lost-streak-toast.component';
import { reloadMomentFor } from '../reload-moment';
import { DailyResultView, DailyStartup, StreakSheetOpener } from './daily-view';

/** Les écrans que la V4 montre sur l'accueil (`/`) : tout ce qui n'est pas la manche ni une erreur. */
const HOME_SCREENS: readonly DailyScreen[] = ['welcome', 'resume_prompt', 'already_played', 'done'];

/**
 * La coquille du jeu du jour : elle porte la partie (`DailyGameStore`, la manche, le partage) et laisse deux pages la montrer, l'accueil (`/`,
 * neutre : les cartes des modes) et le défi (`/daily`, la manche). Les stores vivent tant qu'on passe de l'une à l'autre : le son lancé d'un
 * toucher sur la carte de l'accueil continue sur la page de la manche, et le score qui monte et les toasts de série suivent la fin de la partie.
 * Elle décide aussi de la page qui montre quoi : sans la V4, la racine renvoie au défi ; avec elle, une manche est sur `/daily`, tout le reste sur `/`.
 */
@Component({
  selector: 'app-daily-shell',
  imports: [RouterOutlet, GuestStreakToastComponent, LostStreakToastComponent, GelUsedToastComponent, GelEarnedToastComponent],
  providers: [DailyGameStore, TrackRoundStore, DailyShare, LostStreakNotice, GuestStreakNotice, DailyStartup, StreakSheetOpener, DailyResultView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <router-outlet />

    <!-- Toasts de fin de partie et d'accueil (série, gels) -->
    @if (store.toasts().guestStreak) {
      <app-guest-streak-toast [streak]="store.toastStreak()" [freezeMiss]="store.toasts().guestFreezeMiss" (dismissed)="dismissGuestStreakToast()" />
    }
    @if (store.showLostToast(); as _) {
      <app-lost-streak-toast [lostStreak]="store.lostStreak() ?? 0" (dismissed)="store.dismissLostToast()" />
    }
    @if (store.toasts().gelUsed) {
      <app-gel-used-toast [freezesUsed]="store.freezesUsed()" [streak]="store.pillStreak()?.streak ?? null" (dismissed)="store.dismissGelToast()" />
    }
    @if (store.toasts().gelEarned) {
      <app-gel-earned-toast
        [streak]="store.pillStreak()?.streak ?? null"
        [freezes]="store.pillStreak()?.freezes ?? 0"
        [maxFreezes]="store.pillStreak()?.maxFreezes ?? 0"
        (dismissed)="store.dismissGelToast()" />
    }
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
  private readonly guestStreakNotice = inject(GuestStreakNotice);
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
    this.destroyRef.onDestroy(() => this.chrome.setImmersive(false));

    // Quelle page montre quoi. Sans l'accès Survie, la racine n'a pas d'accueil à part : c'est le défi. Avec lui, une manche est sur `/daily`, le
    // reste (carte du défi, pause, abandon, résultat) sur `/`.
    effect(() => {
      const screen = this.store.screen();
      const path = this.path();
      const known = this.chrome.v4Known();
      const v4 = this.chrome.v4();
      if (path === '/' && ((known && !v4) || screen === 'playing')) this.goTo('/daily');
      else if (path === '/daily' && v4 && HOME_SCREENS.includes(screen)) this.goTo('/');
    });

    // Une nouvelle version du site ne recharge jamais la page en pleine manche (cf. `reloadMomentFor`).
    inject(VersionService).allowReload(() => reloadMomentFor(this.store.screen()), this.destroyRef);
  }

  ngOnInit(): void {
    void this.startup.run();
  }

  /** Le bandeau « crée un compte » fermé par un invité ne revient pas d'une visite à l'autre (règles dans `domain/toasts`). */
  protected dismissGuestStreakToast(): void {
    this.guestStreakNotice.remember(this.store.dismissStreakToast());
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
