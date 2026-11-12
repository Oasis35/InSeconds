import { ChangeDetectionStrategy, Component, computed, effect, inject, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { map } from 'rxjs';
import { ErrorReportingService } from '../../../core/errors/error-reporting.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { AccountLinkComponent } from '../../../core/shell/account-link/account-link.component';
import { InstagramLinkComponent } from '../../../core/shell/instagram-link/instagram-link.component';
import { BrandComponent } from '../../../gameplay/ui/brand/brand.component';
import { DecorBackgroundComponent } from '../../../ui/decor-background/decor-background.component';
import { dayLabel, formatScore, isMonthText, utcDayOf } from '../../../ui/format/day-label';
import { HistorySummaryComponent } from '../../../ui/history/history-summary.component';
import { HistoryTabsComponent } from '../../../ui/history/history-tabs.component';
import { MonthNavComponent } from '../../../ui/history/month-nav.component';
import { DailyHistoryStore } from '../../data-access/daily-history.store';
import { gameLink, verdictOf } from '../../domain/history';
import { StatusScreenComponent } from '../../ui/status-screen/status-screen.component';

/**
 * L'historique du joueur sur le défi du jour (`/daily/history`, `?mois=aaaa-mm`) : le résumé de toutes ses parties, puis un mois à la fois.
 * Une ligne mène aux réponses du jour. L'onglet « Setlists » est la page du mode Setlist (`/setlist/history`) : les modes ne se connaissent pas.
 */
@Component({
  selector: 'app-daily-history-page',
  imports: [
    TranslatePipe, RouterLink, DecorBackgroundComponent, BrandComponent, AccountLinkComponent, InstagramLinkComponent,
    HistoryTabsComponent, HistorySummaryComponent, MonthNavComponent, StatusScreenComponent,
  ],
  providers: [DailyHistoryStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './daily-history.page.html',
  styles: `
    .bar { width: 14px; height: 4px; border-radius: 2px; background: var(--color-fail); }
    .bar[data-verdict='found'] { background: var(--color-success); }
    .bar[data-verdict='half'] { background: linear-gradient(90deg, var(--color-success) 50%, var(--color-fail) 50%); }
  `,
})
export class DailyHistoryPage {
  protected readonly store = inject(DailyHistoryStore);
  protected readonly language = inject(LanguageService);
  protected readonly errorReporting = inject(ErrorReportingService);

  /** Le mois de l'adresse ; mal écrit ou absent : le mois en cours (le serveur le choisit). */
  private readonly month = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(map(params => (isMonthText(params.get('mois')) ? params.get('mois') : null))),
    { initialValue: null },
  );

  private readonly today = utcDayOf(new Date());

  /** Les lignes du mois : le jour en toutes lettres, les petites barres, le score et où mène la ligne. */
  protected readonly rows = computed(() => {
    const lang = this.language.current();
    return (this.store.history()?.games ?? []).map(game => ({
      date: game.date,
      score: formatScore(game.score, lang),
      day: dayLabel(game.date, this.today, lang),
      link: gameLink(game.date, this.today),
      bars: game.tracks.map(track => ({ position: track.position, verdict: verdictOf(track) })),
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
