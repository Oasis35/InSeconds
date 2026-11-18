import { Injectable, Signal, computed, effect, inject, signal, untracked } from '@angular/core';
import { Router } from '@angular/router';
import { ShellChromeStore } from '../../../core/shell/shell-chrome.store';
import { LanguageService } from '../../../core/i18n/language.service';
import { ModalService } from '../../../ui/modal/modal.service';
import { formatSeconds } from '../../../ui/format/format-seconds';
import { DailyGameStore } from '../../data-access/daily-game.store';
import { DailyShare } from '../../data-access/daily-share';
import { LostStreakNotice } from '../../data-access/lost-streak-notice';
import { GuestStreakNotice } from '../../data-access/guest-streak-notice';
import { DailyScreen } from '../../domain/daily-screen';
import { rowsFromResults, rowsFromStats, shareTracksOf } from '../../ui/day-result-screen/result-rows';
import { countUp } from '../../ui/score-count/count-up';
import { StreakSheetComponent, StreakSheetData, StreakSheetResult } from '../../ui/streak-sheet/streak-sheet.component';

/**
 * L'écran à montrer. Tant que le flag de la V4 n'est pas lu (l'accès se lit après l'identité, puis l'appel API), rien du jeu n'est montré,
 * sauf une manche en cours : un chargement neutre, jamais l'ancien accueil qui change de forme une seconde plus tard.
 */
export function visibleScreen(): Signal<DailyScreen> {
  const store = inject(DailyGameStore);
  const chrome = inject(ShellChromeStore);
  return computed(() => (!chrome.v4Known() && store.screen() !== 'playing' ? 'loading' : store.screen()));
}

/** Premier chargement du jour (ou « Réessayer ») : l'état du jour, puis le toast invité « série perdue » s'il est dû. Fourni par `DailyShellComponent`. */
@Injectable()
export class DailyStartup {
  private readonly store = inject(DailyGameStore);
  private readonly lostStreakNotice = inject(LostStreakNotice);
  private readonly guestStreakNotice = inject(GuestStreakNotice);

  async run(): Promise<void> {
    this.store.restoreStreakToastDismissal(this.guestStreakNotice.dismissedAt());
    await this.store.init();
    const streak = this.store.today()?.streak;
    const lost = streak ? this.lostStreakNotice.take(streak) : null;
    if (lost !== null) this.store.announceLostStreak(lost);
  }
}

/** Le panneau de série (« Série de 12 jours »), ouvert depuis l'accueil comme depuis la page du défi. */
@Injectable()
export class StreakSheetOpener {
  private readonly store = inject(DailyGameStore);
  private readonly language = inject(LanguageService);
  private readonly modal = inject(ModalService);
  private readonly router = inject(Router);

  open(): void {
    const data: StreakSheetData = {
      streak: this.store.sheetStreak(), linked: this.store.linked(), gamesPlayed: this.store.sheetGamesPlayed(), lang: this.language.current(),
    };
    const dialog = this.modal.openSheet<StreakSheetResult, StreakSheetData, StreakSheetComponent>(StreakSheetComponent, { data });
    dialog.closed.subscribe(result => {
      if (result === 'playNow') this.store.playNow();
      else if (result === 'signup') void this.router.navigate(['/account/login']);
    });
  }
}

/** Le résultat du jour : les morceaux, le score qui monte juste après la partie, le partage. Les mêmes sur l'accueil (V4) et sur la page du défi. */
@Injectable()
export class DailyResultView {
  private readonly store = inject(DailyGameStore);
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
