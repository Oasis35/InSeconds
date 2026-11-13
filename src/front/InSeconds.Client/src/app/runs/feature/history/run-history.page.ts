import { ChangeDetectionStrategy, Component, computed, effect, inject, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { map } from 'rxjs';
import { ErrorReportingService } from '../../../core/errors/error-reporting.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { AccountLinkComponent } from '../../../core/shell/account-link/account-link.component';
import { InstagramLinkComponent } from '../../../core/shell/instagram-link/instagram-link.component';
import { BrandComponent } from '../../../ui/brand/brand.component';
import { DecorBackgroundComponent } from '../../../ui/decor-background/decor-background.component';
import { dayLabel, formatScore, isMonthText, utcDayOf } from '../../../ui/format/day-label';
import { HistorySummaryComponent } from '../../../ui/history/history-summary.component';
import { HistoryTabsComponent } from '../../../ui/history/history-tabs.component';
import { MonthNavComponent } from '../../../ui/history/month-nav.component';
import { RunHistoryStore } from '../../data-access/run-history.store';
import { DIFFICULTY_FILTERS, DifficultyFilter } from '../../domain/run-history';
import { RunDiscComponent } from '../../ui/run-disc/run-disc.component';
import { RunStatusScreenComponent } from '../../ui/run-status-screen/run-status-screen.component';

/**
 * L'historique du joueur sur le mode Setlist (`/setlist/history`, `?mois=aaaa-mm`) : le résumé de toutes ses parties, un filtre par difficulté,
 * puis un mois à la fois. Une ligne ouvre les morceaux de la partie. L'onglet « Défis du jour » est la page du jeu du jour (`/daily/history`).
 * Ce sont ses propres parties : pas d'accès sur invitation à vérifier.
 */
@Component({
  selector: 'app-run-history-page',
  imports: [
    TranslatePipe, RouterLink, DecorBackgroundComponent, BrandComponent, AccountLinkComponent, InstagramLinkComponent,
    HistoryTabsComponent, HistorySummaryComponent, MonthNavComponent, RunDiscComponent, RunStatusScreenComponent,
  ],
  providers: [RunHistoryStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './run-history.page.html',
})
export class RunHistoryPage {
  protected readonly store = inject(RunHistoryStore);
  protected readonly language = inject(LanguageService);
  protected readonly errorReporting = inject(ErrorReportingService);
  protected readonly filters = DIFFICULTY_FILTERS;

  /** Le mois de l'adresse ; mal écrit ou absent : le mois en cours (le serveur le choisit). */
  private readonly month = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(map(params => (isMonthText(params.get('mois')) ? params.get('mois') : null))),
    { initialValue: null },
  );

  private readonly today = utcDayOf(new Date());

  protected readonly rows = computed(() => {
    const lang = this.language.current();
    return this.store.visibleRuns().map(run => ({
      sessionId: run.sessionId,
      disc: run.disc.key,
      difficultyKey: `runs.difficulty.${run.difficulty}`,
      score: formatScore(run.score, lang),
      day: dayLabel(run.date, this.today, lang),
    }));
  });

  constructor() {
    // Chaque changement de mois dans l'adresse relit l'historique (les flèches sont des liens).
    effect(() => {
      const month = this.month();
      untracked(() => void this.store.load(month));
    });
  }

  protected filterKey(filter: DifficultyFilter): string {
    return filter === 'all' ? 'ui.history.setlist.all' : `runs.difficulty.${filter}`;
  }

  protected retry(): void {
    void this.store.load(this.month());
  }
}
