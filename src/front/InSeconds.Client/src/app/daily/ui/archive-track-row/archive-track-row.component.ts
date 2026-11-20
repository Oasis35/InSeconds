import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { GuessTimeChartComponent } from '../../../gameplay/ui/guess-time-chart/guess-time-chart.component';
import { ArchiveMyAnswer, ArchiveTrack } from '../../domain/archive';
import { DeezerBadgeComponent } from '../../../gameplay/ui/deezer-badge/deezer-badge.component';
import { PointsPipe } from '../../../ui/format/points.pipe';

/**
 * Un morceau d'un jour passé, en ligne compacte : pochette numérotée, titre, artiste et année ; à droite, pour un joueur reconnu, « Toi » (✓ ou ✗
 * pour l'artiste et le titre, ses points en orange), sinon la part des joueurs qui l'ont trouvé (violet). Un toucher déplie le détail : « le plus
 * raté » en rouge, « Joueurs » (parts de l'artiste et du titre trouvés), l'histogramme des paliers (sa barre en orange), puis l'écoute de l'extrait
 * (rond cyan, le son) et le badge Deezer. Sans statistiques, le détail n'a que l'écoute.
 */
@Component({
  selector: 'app-archive-track-row',
  imports: [PointsPipe, TranslatePipe, DeezerBadgeComponent, GuessTimeChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './archive-track-row.component.html',
})
export class ArchiveTrackRowComponent {
  readonly track = input.required<ArchiveTrack>();
  /** La réponse du joueur reconnu sur ce morceau ; vide pour un visiteur (ou un joueur qui n'a pas fini ce jour-là). */
  readonly mine = input<ArchiveMyAnswer | null>(null);
  readonly mostMissed = input(false);
  readonly lang = input<'fr' | 'en'>('fr');
  /** Son extrait est en cours de lecture (le lecteur est celui de la page). */
  readonly playing = input(false);
  /** Le bouton d'écoute : la page joue l'extrait, ou le met en pause. */
  readonly listen = output();

  /** Le détail est déplié. */
  protected readonly open = signal(false);

  /** Badge Deezer vertical (logo carré) : ses proportions ne sont pas les mêmes en français et en anglais. */
  protected readonly badgeSize = computed(() => (this.lang() === 'en' ? { width: '30', height: '42' } : { width: '47', height: '42' }));

  protected readonly hasStats = computed(() => this.track().artistFoundPercent !== null);

  /** La part des joueurs qui ont trouvé quelque chose (artiste ou titre). */
  protected readonly foundPercent = computed(() => 100 - (this.track().notFoundPercent ?? 0));

  protected readonly distribution = computed(() =>
    this.track().guessSteps.map(s => ({ durationSeconds: s.durationSeconds, count: s.percent })));

  /** Sa barre : le palier où il a trouvé quelque chose, sinon « ✗ ». */
  protected readonly myDuration = computed(() => {
    const mine = this.mine();
    return mine && (mine.artistCorrect || mine.titleCorrect) ? mine.listenedSeconds : null;
  });
  protected readonly myMiss = computed(() => {
    const mine = this.mine();
    return mine !== null && !mine.artistCorrect && !mine.titleCorrect;
  });
}
