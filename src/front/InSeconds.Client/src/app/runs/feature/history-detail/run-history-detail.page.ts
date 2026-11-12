import { ChangeDetectionStrategy, Component, Injector, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { AudioPreviewPlayer } from '../../../core/audio-preview/audio-preview.player';
import { PreviewTrackData, PreviewTrackDialog } from '../../../core/audio-preview/preview-track.dialog';
import { ErrorReportingService } from '../../../core/errors/error-reporting.service';
import { DecorBackgroundComponent } from '../../../ui/decor-background/decor-background.component';
import { ModalService } from '../../../ui/modal/modal.service';
import { RunsApi } from '../../data-access/runs.api';
import { RunTrack } from '../../domain/run';
import { isMissed, tracksByRound } from '../../domain/run-history';
import { RunStatusScreenComponent } from '../../ui/run-status-screen/run-status-screen.component';

/**
 * Les morceaux d'une setlist finie du joueur (`/setlist/history/<partie>`), rangés par manche : « Tous » ou « Ratés », et ▶ pour réécouter un
 * extrait (une adresse neuve à chaque écoute, piège 14). Rien ne s'y rejoue. Une partie d'un autre joueur, en cours ou inconnue : introuvable.
 */
@Component({
  selector: 'app-run-history-detail-page',
  imports: [TranslatePipe, RouterLink, DecorBackgroundComponent, RunStatusScreenComponent],
  providers: [AudioPreviewPlayer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './run-history-detail.page.html',
})
export class RunHistoryDetailPage implements OnInit {
  private readonly api = inject(RunsApi);
  private readonly modal = inject(ModalService);
  private readonly injector = inject(Injector);
  private readonly route = inject(ActivatedRoute);
  protected readonly errorReporting = inject(ErrorReportingService);

  protected readonly status = signal<'loading' | 'ready' | 'not_found' | 'error'>('loading');
  protected readonly onlyMissed = signal(false);
  private readonly tracks = signal<readonly RunTrack[]>([]);
  private sessionId = 0;

  protected readonly count = computed(() => this.tracks().length);
  protected readonly missedCount = computed(() => this.tracks().filter(isMissed).length);
  protected readonly rounds = computed(() => tracksByRound(this.tracks(), this.onlyMissed()));
  protected readonly isMissed = isMissed;

  ngOnInit(): void {
    void this.load();
  }

  protected async load(): Promise<void> {
    this.sessionId = Number(this.route.snapshot.paramMap.get('id'));
    if (!Number.isInteger(this.sessionId) || this.sessionId <= 0) {
      this.status.set('not_found');
      return;
    }
    this.status.set('loading');
    try {
      const session = await this.api.session(this.sessionId);
      // Une partie en cours ne montre pas ses morceaux ici : elle se reprend.
      if (session.status === 'pending') {
        this.status.set('not_found');
        return;
      }
      this.tracks.set(session.playedTracks);
      this.status.set('ready');
    } catch (error) {
      this.status.set((error as { status?: unknown } | null)?.status === 404 ? 'not_found' : 'error');
    }
  }

  protected listen(track: RunTrack): void {
    const data: PreviewTrackData = {
      artist: track.artist ?? '', title: track.title ?? '', loadPreviewUrl: () => this.api.pastPreviewUrl(this.sessionId, track.position),
    };
    this.modal.open(PreviewTrackDialog, { data, maxWidth: '26rem', injector: this.injector });
  }
}
