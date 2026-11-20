import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AudioPreviewPlayer } from '../../../core/audio-preview/audio-preview.player';
import { ErrorReportingService } from '../../../core/errors/error-reporting.service';
import { LanguageService } from '../../../core/i18n/language.service';
import { AccountLinkComponent } from '../../../core/shell/account-link/account-link.component';
import { BrandComponent } from '../../../ui/brand/brand.component';
import { ButtonComponent } from '../../../ui/button/button.component';
import { DecorBackgroundComponent } from '../../../ui/decor-background/decor-background.component';
import { HomeLegalLineComponent } from '../../../ui/legal-line/home-legal-line.component';
import { DeezerBadgeComponent } from '../../../gameplay/ui/deezer-badge/deezer-badge.component';
import { ReplayStore } from '../../data-access/replay.store';
import { formatGameDate } from '../../domain/archive';
import { ReplayFilter, ReplayTrack, replayKey } from '../../domain/replay';
import { ReplayTrackRowComponent } from '../../ui/replay-track-row/replay-track-row.component';
import { StatusScreenComponent } from '../../ui/status-screen/status-screen.component';

/** Ce qui joue : le morceau, son jour, et sa clé. */
interface NowPlaying {
  readonly key: string;
  readonly date: string;
  readonly track: ReplayTrack;
}

/**
 * « À réécouter » (`/history/daily/a-reecouter`) : les morceaux que le joueur a ratés, par jour, du plus récent au plus ancien, avec les filtres
 * Tous / Rien trouvé / À moitié et « Voir plus ». Le rond d'écoute joue l'extrait de 30 s de Deezer, l'adresse étant demandée à chaque écoute
 * (piège 14) ; le lecteur du bas (cadre cyan : le son) dit ce qui joue, son avancement et mène au morceau sur Deezer. Rien n'est stocké (piège 47).
 */
@Component({
  selector: 'app-replay-page',
  imports: [
    TranslatePipe, RouterLink, DecorBackgroundComponent, BrandComponent, AccountLinkComponent, HomeLegalLineComponent, ButtonComponent,
    DeezerBadgeComponent, ReplayTrackRowComponent, StatusScreenComponent,
  ],
  providers: [ReplayStore, AudioPreviewPlayer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './replay.page.html',
})
export class ReplayPage {
  protected readonly store = inject(ReplayStore);
  protected readonly player = inject(AudioPreviewPlayer);
  protected readonly language = inject(LanguageService);
  protected readonly errorReporting = inject(ErrorReportingService);

  protected readonly now = signal<NowPlaying | null>(null);
  protected readonly playingKey = this.player.playingKey;
  protected readonly replayKey = replayKey;

  protected readonly filters = computed(() => [
    { id: 'all' as const, count: this.store.allCount() },
    { id: 'none' as const, count: this.store.noneCount() },
    { id: 'half' as const, count: this.store.halfCount() },
  ]);

  protected readonly days = computed(() => {
    const lang = this.language.current();
    return this.store.days().map(day => {
      const label = formatGameDate(day.date, lang, 'weekday');
      return { ...day, label: label.charAt(0).toUpperCase() + label.slice(1) };
    });
  });

  constructor() {
    void this.store.load('all');
  }

  protected select(filter: ReplayFilter): void {
    if (filter !== this.store.filter()) void this.store.load(filter);
  }

  protected retry(): void {
    void this.store.load(this.store.filter());
  }

  /** Joue l'extrait du morceau, ou le met en pause ; une nouvelle écoute redemande l'adresse (piège 14). */
  protected listen(date: string, track: ReplayTrack): void {
    const key = replayKey(date, track.position);
    if (this.now()?.key !== key) this.now.set({ key, date, track });
    void this.player.listen(key, () => this.store.previewUrl(date, track.position));
  }
}
