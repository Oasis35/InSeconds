import { ChangeDetectionStrategy, Component, computed, effect, inject, untracked } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { map } from 'rxjs';
import { ErrorReportingService } from '../../../core/errors/error-reporting.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { AccountLinkComponent } from '../../../core/shell/account-link/account-link.component';
import { InstagramLinkComponent } from '../../../core/shell/instagram-link/instagram-link.component';
import { ShellChromeStore } from '../../../core/shell/shell-chrome.store';
import { BrandComponent } from '../../../ui/brand/brand.component';
import { DecorBackgroundComponent } from '../../../ui/decor-background/decor-background.component';
import { dayLabel, isMonthText, utcDayOf } from '../../../ui/format/day-label';
import { PointsPipe } from '../../../ui/format/points.pipe';
import { HistoryTabsComponent } from '../../../ui/history/history-tabs.component';
import { HomeLegalLineComponent } from '../../../ui/legal-line/home-legal-line.component';
import { DailyHistoryStore } from '../../data-access/daily-history.store';
import { EarProfileStore } from '../../data-access/ear-profile.store';
import { WeekReviewStore } from '../../data-access/week-review.store';
import { EarProfileCardComponent } from '../../ui/ear-profile-card/ear-profile-card.component';
import { HistoryCalendarComponent } from '../../ui/history-calendar/history-calendar.component';
import { StatusScreenComponent } from '../../ui/status-screen/status-screen.component';
import { WeekReviewCardComponent } from '../../ui/week-review-card/week-review-card.component';

/**
 * L'historique du joueur sur le défi du jour (`/history/daily`, `?mois=aaaa-mm`) : le défi d'aujourd'hui en tête, « Ta semaine » (la semaine dernière, du lundi au dimanche), la carte de son profil d'oreille,
 * le calendrier du mois (une case par jour de défi, qui mène à ses réponses) et l'entrée « À réécouter ». L'onglet « Survie » est la page du mode
 * (`/history/survie`) : les modes ne se connaissent pas.
 */
@Component({
  selector: 'app-daily-history-page',
  imports: [
    HomeLegalLineComponent, TranslatePipe, RouterLink, PointsPipe, DecorBackgroundComponent, BrandComponent, InstagramLinkComponent, AccountLinkComponent,
    HistoryTabsComponent, HistoryCalendarComponent, EarProfileCardComponent, StatusScreenComponent, WeekReviewCardComponent,
  ],
  providers: [DailyHistoryStore, EarProfileStore, WeekReviewStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './daily-history.page.html',
})
export class DailyHistoryPage {
  protected readonly store = inject(DailyHistoryStore);
  protected readonly profile = inject(EarProfileStore);
  private readonly weekStore = inject(WeekReviewStore);
  protected readonly language = inject(LanguageService);
  protected readonly chrome = inject(ShellChromeStore);
  protected readonly errorReporting = inject(ErrorReportingService);

  /** Le mois de l'adresse ; mal écrit ou absent : le mois en cours (le serveur le choisit). */
  private readonly month = toSignal(
    inject(ActivatedRoute).queryParamMap.pipe(map(params => (isMonthText(params.get('mois')) ? params.get('mois') : null))),
    { initialValue: null },
  );

  private readonly today = utcDayOf(new Date());

  /** Le défi d'aujourd'hui, s'il est dans le mois affiché : à jouer (la tuile de focus) ou joué (son score). */
  protected readonly todayDay = computed(() => {
    const day = this.store.history()?.days.find(d => d.date === this.today);
    if (!day) return null;
    const label = dayLabel(day.date, this.today, this.language.current());
    return { label: label.text.toLowerCase(), done: day.state !== 'today' || this.chrome.dailyDone() === true, score: day.score };
  });

  /** La carte du profil : seulement s'il a joué sur les 8 dernières semaines. */
  protected readonly earProfile = computed(() => {
    const profile = this.profile.profile();
    return profile && profile.gamesPlayed > 0 ? profile : null;
  });

  /** La carte « Ta semaine » : seulement s'il a terminé au moins une partie la semaine dernière. */
  protected readonly weekReview = computed(() => {
    const review = this.weekStore.review();
    return review && review.playedCount > 0 ? review : null;
  });

  constructor() {
    // Chaque changement de mois dans l'adresse relit l'historique (les flèches sont des liens).
    effect(() => {
      const month = this.month();
      untracked(() => void this.store.load(month));
    });
    void this.profile.load('8w');
    void this.weekStore.load();
  }

  protected retry(): void {
    void this.store.load(this.month());
  }
}
