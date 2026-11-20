import { ChangeDetectionStrategy, Component, DestroyRef, OnInit, computed, effect, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { AudioPreviewPlayer } from '../../../core/audio-preview/audio-preview.player';
import { ErrorReportingService } from '../../../core/errors/error-reporting.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { PageMetaService } from '../../../core/seo/page-meta.service';
import { AccountLinkComponent } from '../../../core/shell/account-link/account-link.component';
import { DayFriendsSlotComponent } from '../../../core/shell/day-friends-slot/day-friends-slot.component';
import { ShellChromeStore } from '../../../core/shell/shell-chrome.store';
import { BrandComponent } from '../../../ui/brand/brand.component';
import { ButtonComponent } from '../../../ui/button/button.component';
import { DecorBackgroundComponent } from '../../../ui/decor-background/decor-background.component';
import { PointsPipe } from '../../../ui/format/points.pipe';
import { HomeLegalLineComponent } from '../../../ui/legal-line/home-legal-line.component';
import { ScoreChartData, ScoreDistributionChartComponent } from '../../../ui/score-distribution-chart/score-distribution-chart.component';
import { ArchiveStore } from '../../data-access/archive.store';
import { ArchiveTrack, answerAt, artistsSummary, formatGameDate } from '../../domain/archive';
import { ArchiveDayHeaderComponent } from '../../ui/archive-day-header/archive-day-header.component';
import { ArchiveTrackRowComponent } from '../../ui/archive-track-row/archive-track-row.component';
import { StatusScreenComponent } from '../../ui/status-screen/status-screen.component';

/**
 * La page d'un jour passé (`/history/daily/aaaa-mm-jj`) : retour à l'historique, ‹ jour ›, la répartition des scores (son score s'il a joué),
 * « Tes amis ce jour-là » (fourni par les groupes, `DAY_FRIENDS_SLOT`), puis les morceaux en lignes compactes dont le détail s'ouvre au toucher.
 * Les réponses et les stats s'affichent d'office, même pour un jour qu'il n'a pas joué : on y lit, rien ne s'y rejoue. « Jouer le défi du jour »
 * seulement s'il reste à jouer. Le titre et la description de la page nomment le jour et ses artistes (moteurs de recherche) ; ceux du site
 * reviennent en quittant la page.
 */
@Component({
  selector: 'app-archive-page',
  imports: [
    PointsPipe, TranslatePipe, RouterLink, DecorBackgroundComponent, BrandComponent, HomeLegalLineComponent, AccountLinkComponent, DayFriendsSlotComponent,
    ArchiveDayHeaderComponent, ArchiveTrackRowComponent, ScoreDistributionChartComponent, StatusScreenComponent, ButtonComponent,
  ],
  providers: [ArchiveStore, AudioPreviewPlayer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './archive.page.html',
})
export class ArchivePage implements OnInit {
  protected readonly store = inject(ArchiveStore);
  protected readonly language = inject(LanguageService);
  protected readonly errorReporting = inject(ErrorReportingService);
  protected readonly chrome = inject(ShellChromeStore);
  protected readonly player = inject(AudioPreviewPlayer);
  private readonly route = inject(ActivatedRoute);
  private readonly translate = inject(TranslateService);
  private readonly pageMeta = inject(PageMetaService);

  protected readonly answerAt = answerAt;

  /** La position du morceau dont l'extrait est chargé (en lecture ou en pause). */
  private readonly current = signal<number | null>(null);
  protected readonly playingPosition = computed(() => (this.player.playing() ? this.current() : null));

  /** Le mois du jour affiché, pour revenir au bon mois de l'historique. */
  protected readonly backMonth = computed(() => this.store.date().slice(0, 7));

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

  constructor() {
    inject(DestroyRef).onDestroy(() => this.pageMeta.resetPageText());

    // Titre et description du jour affiché, dans la langue choisie.
    effect(() => {
      const day = this.store.day();
      const lang = this.language.current();
      if (!day) return;
      const date = formatGameDate(day.date, lang);
      this.translate.get(['daily.archive.pageTitle', 'daily.archive.pageDescription'], { date, artists: artistsSummary(day) })
        .subscribe(t => {
          this.pageMeta.setPageText(t['daily.archive.pageTitle'], t['daily.archive.pageDescription']);
        });
    });
  }

  ngOnInit(): void {
    this.route.paramMap.subscribe(params => {
      this.player.stop();
      this.current.set(null);
      void this.store.load(params.get('date') ?? '');
    });
  }

  protected retry(): void {
    void this.store.load(this.store.date());
  }

  /** Joue l'extrait du morceau, ou le met en pause ; l'adresse est demandée à chaque nouvelle écoute (piège 14). */
  protected async listen(track: ArchiveTrack): Promise<void> {
    const loaded = this.player.url();
    if (this.current() === track.position && loaded) {
      this.player.toggle(loaded);
      return;
    }
    this.player.stop();
    this.current.set(track.position);
    const url = await this.store.previewUrl(track.position).catch(() => null);
    if (this.current() === track.position) this.player.toggle(url);
  }
}
