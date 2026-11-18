import { ChangeDetectionStrategy, Component, computed, effect, inject, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { map } from 'rxjs';
import { ErrorReportingService } from '../../../core/errors/error-reporting.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { AccountLinkComponent } from '../../../core/shell/account-link/account-link.component';
import { InstagramLinkComponent } from '../../../core/shell/instagram-link/instagram-link.component';
import { HomeLegalLineComponent } from '../../../ui/legal-line/home-legal-line.component';
import { BrandComponent } from '../../../ui/brand/brand.component';
import { DecorBackgroundComponent } from '../../../ui/decor-background/decor-background.component';
import { dayLabel, formatScore, isMonthText, utcDayOf } from '../../../ui/format/day-label';
import { HistorySummaryComponent } from '../../../ui/history/history-summary.component';
import { HistoryTabsComponent } from '../../../ui/history/history-tabs.component';
import { MonthNavComponent } from '../../../ui/history/month-nav.component';
import { RunHistoryStore } from '../../data-access/run-history.store';
import { RunStatusScreenComponent } from '../../ui/run-status-screen/run-status-screen.component';

/**
 * L'historique du joueur sur le mode Setlist (`/history/survie`, `?mois=aaaa-mm`) : le résumé de toutes ses parties, puis un mois à la fois. Une ligne ouvre les morceaux de la partie. L'onglet « Défis du jour » est la page du jeu du jour (`/history/daily`).
 * Ce sont ses propres parties : pas d'accès sur invitation à vérifier.
 */
@Component({
  selector: 'app-run-history-page',
  imports: [HomeLegalLineComponent, 
    TranslatePipe, RouterLink, DecorBackgroundComponent, BrandComponent, AccountLinkComponent, InstagramLinkComponent,
    HistoryTabsComponent, HistorySummaryComponent, MonthNavComponent, RunStatusScreenComponent,
  ],
  providers: [RunHistoryStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './run-history.page.html',
})
export class RunHistoryPage {
  protected readonly store = inject(RunHistoryStore);
  protected readonly language = inject(LanguageService);
  protected readonly errorReporting = inject(ErrorReportingService);

  /** Le mois de l'adresse ; mal écrit ou absent : le mois en cours (le serveur le choisit). */
  private readonly month = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(map(params => (isMonthText(params.get('mois')) ? params.get('mois') : null))),
    { initialValue: null },
  );

  private readonly today = utcDayOf(new Date());

  protected readonly rows = computed(() => {
    const lang = this.language.current();
    return (this.store.history()?.runs ?? []).map(run => ({
      sessionId: run.sessionId,
      roundsPassed: run.roundsPassed,
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

  protected retry(): void {
    void this.store.load(this.month());
  }
}
