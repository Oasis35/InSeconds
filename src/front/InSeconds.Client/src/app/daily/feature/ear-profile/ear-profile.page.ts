import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ErrorReportingService } from '../../../core/errors/error-reporting.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { AccountLinkComponent } from '../../../core/shell/account-link/account-link.component';
import { BrandComponent } from '../../../ui/brand/brand.component';
import { DecorBackgroundComponent } from '../../../ui/decor-background/decor-background.component';
import { PointsPipe } from '../../../ui/format/points.pipe';
import { SecondsPipe } from '../../../ui/format/seconds.pipe';
import { HomeLegalLineComponent } from '../../../ui/legal-line/home-legal-line.component';
import { EarProfileStore } from '../../data-access/ear-profile.store';
import { ProfilePeriod, favouriteStep, playersFavouriteStep } from '../../domain/ear-profile';
import { EarProfileChartComponent } from '../../ui/ear-profile-chart/ear-profile-chart.component';
import { StatusScreenComponent } from '../../ui/status-screen/status-screen.component';

const PERIODS: readonly ProfilePeriod[] = ['8w', '6m', 'all'];

/**
 * Le profil d'oreille (`/history/daily/profil`) : sur 8 semaines, 6 mois ou depuis le début, sa moyenne et sa tendance avec la courbe face aux
 * joueurs (la tuile de focus), quatre chiffres, « Quand tu trouves » (ses parts par palier, en ambre, face aux joueurs, en violet) et « Artiste
 * ou titre ? ». Les comparaisons n'existent qu'au-dessus des seuils du serveur ; jamais un autre joueur nommé.
 */
@Component({
  selector: 'app-ear-profile-page',
  imports: [
    TranslatePipe, RouterLink, PointsPipe, SecondsPipe, DecorBackgroundComponent, BrandComponent, AccountLinkComponent, HomeLegalLineComponent,
    EarProfileChartComponent, StatusScreenComponent,
  ],
  providers: [EarProfileStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './ear-profile.page.html',
})
export class EarProfilePage {
  protected readonly store = inject(EarProfileStore);
  protected readonly language = inject(LanguageService);
  protected readonly errorReporting = inject(ErrorReportingService);
  protected readonly periods = PERIODS;

  protected readonly favourite = computed(() => favouriteStep(this.store.profile()?.steps ?? []));
  protected readonly playersFavourite = computed(() => playersFavouriteStep(this.store.profile()?.steps ?? []));

  /** Les colonnes de « Quand tu trouves », la dernière pour « rien trouvé » ; hauteurs relatives à la plus haute des deux séries. */
  protected readonly bars = computed(() => {
    const profile = this.store.profile();
    if (!profile) return [];
    const columns = [
      ...profile.steps.map(s => ({ seconds: s.seconds as number | null, mine: s.percent, players: s.playersPercent })),
      { seconds: null, mine: profile.notFoundPercent ?? 0, players: profile.playersNotFoundPercent },
    ];
    const max = Math.max(1, ...columns.flatMap(c => [c.mine, c.players ?? 0]));
    return columns.map(c => ({ ...c, mineHeight: Math.round((c.mine / max) * 76), playersHeight: c.players === null ? 0 : Math.round((c.players / max) * 76) }));
  });

  protected readonly trend = computed(() => {
    const value = this.store.profile()?.trendPercent ?? 0;
    return `${value > 0 ? '+' : ''}${value}`;
  });

  constructor() {
    void this.store.load('8w');
  }

  protected select(period: ProfilePeriod): void {
    if (period !== this.store.period()) void this.store.load(period);
  }

  protected retry(): void {
    void this.store.load(this.store.period());
  }
}
