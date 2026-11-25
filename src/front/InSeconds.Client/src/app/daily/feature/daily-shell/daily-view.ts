import { Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { LanguageService } from '../../../core/i18n/language.service';
import { ModalService } from '../../../ui/modal/modal.service';
import { formatSeconds } from '../../../ui/format/format-seconds';
import { HomeStore } from '../../data-access/home.store';
import { DailyShare } from '../../data-access/daily-share';
import { LostStreakNotice } from '../../data-access/lost-streak-notice';
import { GuestStreakNotice } from '../../data-access/guest-streak-notice';
import { rowsFromResults, rowsFromStats, shareTracksOf } from '../../ui/result-rows/result-rows';
import { countUp } from '../../ui/score-count/count-up';
import { DailyLauncher } from './daily-launcher';
import { StreakSheetComponent, StreakSheetData, StreakSheetResult } from '../../ui/streak-sheet/streak-sheet.component';

/** Premier chargement du jour (ou « Réessayer ») : l'état du jour, puis la tuile invité « série perdue » si elle est due. Fourni par `DailyShellComponent`. */
@Injectable()
export class DailyStartup {
  private readonly store = inject(HomeStore);
  private readonly lostStreakNotice = inject(LostStreakNotice);
  private readonly guestStreakNotice = inject(GuestStreakNotice);

  async run(): Promise<void> {
    this.store.restoreGuestTileDismissal(this.guestStreakNotice.dismissed());
    await this.store.init();
    const streak = this.store.today()?.streak;
    const lost = streak ? this.lostStreakNotice.take(streak) : null;
    if (lost !== null) this.store.announceLostStreak(lost);
  }
}

/** Le panneau de série (« Série de 12 jours »), ouvert depuis l'accueil. */
@Injectable()
export class StreakSheetOpener {
  private readonly store = inject(HomeStore);
  private readonly launcher = inject(DailyLauncher);
  private readonly language = inject(LanguageService);
  private readonly modal = inject(ModalService);
  private readonly router = inject(Router);

  open(): void {
    const data: StreakSheetData = {
      streak: this.store.sheetStreak(), linked: this.store.linked(), gamesPlayed: this.store.sheetGamesPlayed(), lang: this.language.current(),
    };
    const dialog = this.modal.openSheet<StreakSheetResult, StreakSheetData, StreakSheetComponent>(StreakSheetComponent, { data });
    dialog.closed.subscribe(result => {
      if (result === 'playNow') this.playNow();
      else if (result === 'signup') void this.router.navigate(['/account/login']);
    });
  }

  /** « Jouer maintenant » : lance ou reprend la partie du jour, seulement depuis la carte du défi ou de la pause. */
  private playNow(): void {
    const screen = this.store.screen();
    if (screen === 'welcome' || screen === 'resume_prompt') this.launcher.start();
  }
}

/** Le résultat du jour : les morceaux, le score qui monte juste après la partie, le partage. Les mêmes sur l'accueil (V4) et sur la page du défi. */
@Injectable()
export class DailyResultView {
  private readonly store = inject(HomeStore);
  private readonly dailyShare = inject(DailyShare);

  readonly copied = this.dailyShare.copied;
  readonly failed = this.dailyShare.failed;
  /** Le score final qui monte de 0 à sa valeur juste après la partie. */
  readonly displayedTotal = signal(0);
  /** Les morceaux du résultat : les réponses de la partie qui vient de finir, sinon celles relues dans les stats. */
  readonly rows = computed(() =>
    this.store.screen() === 'done' ? rowsFromResults(this.store.results(), this.store.stats()) : rowsFromStats(this.store.stats()));

  constructor() {
    effect(() => {
      if (this.store.screen() !== 'done') return;
      const total = untracked(() => this.store.totalScore());
      this.displayedTotal.set(0);
      countUp(total, v => this.displayedTotal.set(v), 1000);
    });
  }

  /** Partage le résumé (menu du téléphone, sinon presse-papier) : une ligne par morceau, avec le palier écouté, dans l'ordre de la liste. */
  share(): void {
    const score = this.store.screen() === 'done' ? this.store.totalScore() : (this.store.stats()?.yourScore ?? 0);
    void this.dailyShare.share(shareTracksOf(this.rows()), score, formatSeconds);
  }
}
