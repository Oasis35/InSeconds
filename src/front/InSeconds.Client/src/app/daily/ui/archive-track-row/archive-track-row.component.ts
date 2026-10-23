import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { GuessTimeChartComponent } from '../../../gameplay/ui/guess-time-chart.component';
import { ArchiveMyAnswer, ArchiveTrack } from '../../domain/archive';
import { DeezerBadgeComponent } from '../../../gameplay/ui/deezer-badge/deezer-badge.component';

/**
 * Un morceau d'un jour passé : pochette numérotée, artiste (« le plus raté » en rouge), titre et année, chacun sur une ligne (tronqués, déplié au
 * toucher, replié au suivant : le texte entier reste dans la page), le bouton « Écouter l'extrait » (cyan, le son), badge Deezer carré en haut
 * à droite ; puis, s'il y a des
 * statistiques, « Joueurs » (violet : part des joueurs qui ont trouvé l'artiste, le titre) et, pour un joueur reconnu, « Toi » (orange : ✓ ou ✗
 * comme à la révélation, ses points), et l'histogramme des paliers, sa barre en orange. Sans statistiques, « Toi » seul.
 */
@Component({
  selector: 'app-archive-track-row',
  imports: [TranslatePipe, DeezerBadgeComponent, GuessTimeChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './archive-track-row.component.html',
})
export class ArchiveTrackRowComponent {
  readonly track = input.required<ArchiveTrack>();
  /** La réponse du joueur reconnu sur ce morceau ; vide pour un visiteur (ou un joueur qui n'a pas fini ce jour-là). */
  readonly mine = input<ArchiveMyAnswer | null>(null);
  readonly mostMissed = input(false);
  readonly lang = input<'fr' | 'en'>('fr');
  /** « Écouter l'extrait » : la page ouvre la fenêtre d'écoute. */
  readonly listen = output();

  /** Artiste et titre en entier (sinon, une ligne chacun). */
  protected readonly expanded = signal(false);

  /** Badge Deezer vertical (logo carré) : ses proportions ne sont pas les mêmes en français et en anglais. */
  protected readonly badgeSize = computed(() => (this.lang() === 'en' ? { width: '30', height: '42' } : { width: '47', height: '42' }));

  protected readonly hasStats = computed(() => this.track().artistFoundPercent !== null);

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
