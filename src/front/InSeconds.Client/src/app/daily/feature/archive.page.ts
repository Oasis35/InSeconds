import {
  ChangeDetectionStrategy, Component, DestroyRef, Injector, OnInit, computed, effect, inject,
} from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { ErrorReportingService } from '../../core/errors/error-reporting.service';
import { LanguageService } from '../../core/i18n/language.service';
import { SessionStore } from '../../core/session/session.store';
import { AccountLinkComponent } from '../../core/shell/account-link/account-link.component';
import { ButtonComponent } from '../../ui/button/button.component';
import { DecorBackgroundComponent } from '../../ui/decor-background/decor-background.component';
import { ModalService } from '../../ui/modal/modal.service';
import { ArchiveStore } from '../data-access/archive.store';
import { answerAt, artistsSummary, formatGameDate } from '../domain/archive';
import { ScoreChartData } from '../domain/daily';
import { EMPTY_STREAK } from '../domain/streak';
import { ArchiveCalendarData, ArchiveCalendarResult, ArchiveCalendarSheetComponent } from '../ui/archive-calendar-sheet/archive-calendar-sheet.component';
import { ArchiveDayHeaderComponent } from '../ui/archive-day-header/archive-day-header.component';
import { ArchiveTrackRowComponent } from '../ui/archive-track-row/archive-track-row.component';
import { DailyBrandComponent } from '../ui/daily-brand/daily-brand.component';
import { DailyFooterComponent } from '../ui/daily-footer/daily-footer.component';
import { ScoreDistributionChartComponent } from '../ui/score-distribution-chart/score-distribution-chart.component';
import { StatusScreenComponent } from '../ui/status-screen/status-screen.component';
import { StreakPillComponent } from '../ui/streak-pill/streak-pill.component';
import { StreakSheetComponent, StreakSheetData, StreakSheetResult } from '../ui/streak-sheet/streak-sheet.component';

/**
 * La page d'un jour passé (`/daily/archive/aaaa-mm-jj`, #407) : les réponses du défi de ce jour-là, ce qu'en ont fait les joueurs (en
 * pourcentages, à partir de 5 joueurs) et, pour un joueur reconnu par son cookie, ce qu'il y a fait. On y lit des réponses : rien ne s'y rejoue.
 * Le titre et la description de la page nomment le jour et ses artistes (moteurs de recherche) ; ceux du site reviennent en quittant la page.
 */
@Component({
  selector: 'app-archive-page',
  imports: [
    TranslatePipe, RouterLink, DecorBackgroundComponent, DailyBrandComponent, DailyFooterComponent, AccountLinkComponent, StreakPillComponent,
    ArchiveDayHeaderComponent, ArchiveTrackRowComponent, ScoreDistributionChartComponent, StatusScreenComponent, ButtonComponent,
  ],
  providers: [ArchiveStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './archive.page.html',
})
export class ArchivePage implements OnInit {
  protected readonly store = inject(ArchiveStore);
  protected readonly session = inject(SessionStore);
  protected readonly language = inject(LanguageService);
  protected readonly errorReporting = inject(ErrorReportingService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly modal = inject(ModalService);
  private readonly injector = inject(Injector);
  private readonly translate = inject(TranslateService);
  private readonly title = inject(Title);
  private readonly meta = inject(Meta);

  protected readonly answerAt = answerAt;

  /** L'égaliseur : les pourcentages des tranches en guise de comptes (seules les hauteurs relatives comptent). */
  protected readonly chart = computed<ScoreChartData | null>(() => {
    const day = this.store.day();
    if (!day?.hasStats) return null;
    const me = this.store.me();
    return {
      yourScore: me.played ? me.score : null,
      medianScore: day.medianScore,
      minScore: day.minScore,
      maxScore: day.maxScore,
      maxPossibleScore: day.maxPossibleScore,
      scoreDistribution: day.scoreDistribution.map(b => ({ minScore: b.minScore, maxScore: b.maxScore, count: b.percent })),
      betterThanPercent: me.played ? me.betterThanPercent : null,
    };
  });

  protected readonly pillStreak = computed(() => this.store.today()?.streak ?? null);

  constructor() {
    const siteTitle = this.title.getTitle();
    const siteDescription = this.meta.getTag('name="description"')?.content ?? null;
    inject(DestroyRef).onDestroy(() => {
      this.title.setTitle(siteTitle);
      if (siteDescription !== null) this.meta.updateTag({ name: 'description', content: siteDescription });
    });

    // Titre et description du jour affiché, dans la langue choisie.
    effect(() => {
      const day = this.store.day();
      const lang = this.language.current();
      if (!day) return;
      const date = formatGameDate(day.date, lang);
      this.translate.get(['daily.archive.pageTitle', 'daily.archive.pageDescription'], { date, artists: artistsSummary(day) })
        .subscribe(t => {
          this.title.setTitle(t['daily.archive.pageTitle']);
          this.meta.updateTag({ name: 'description', content: t['daily.archive.pageDescription'] });
        });
    });
  }

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => void this.store.load(params.get('date') ?? ''));
    void this.store.loadToday();
  }

  protected retry(): void {
    void this.store.load(this.store.date());
  }

  protected async openCalendar(): Promise<void> {
    const day = this.store.day();
    if (!day) return;
    const dates = await this.store.loadDates();
    const data: ArchiveCalendarData = { dates, current: day.date, lang: this.language.current() };
    const ref = this.modal.openSheet<ArchiveCalendarResult, ArchiveCalendarData, ArchiveCalendarSheetComponent>(
      ArchiveCalendarSheetComponent, { data, injector: this.injector });
    ref.closed.subscribe(date => {
      if (date && date !== day.date) void this.router.navigate(['/daily/archive', date]);
    });
  }

  protected openStreakSheet(): void {
    const today = this.store.today();
    const data: StreakSheetData = {
      streak: today?.streak ?? EMPTY_STREAK, linked: this.session.isLinked(), gamesPlayed: today?.completedGames ?? null, lang: this.language.current(),
    };
    const dialog = this.modal.openSheet<StreakSheetResult, StreakSheetData, StreakSheetComponent>(StreakSheetComponent, { data });
    dialog.closed.subscribe(result => {
      if (result === 'playNow') void this.router.navigate(['/daily']);
      else if (result === 'signup') void this.router.navigate(['/account/login']);
    });
  }

  protected toggleLanguage(): void {
    this.language.use(this.language.current() === 'fr' ? 'en' : 'fr');
  }
}
