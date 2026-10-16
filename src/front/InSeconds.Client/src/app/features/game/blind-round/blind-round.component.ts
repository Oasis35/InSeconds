import {
  Component, input, output, inject, signal, computed, effect, OnDestroy,
  ChangeDetectionStrategy, DestroyRef
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { AudioPlayerService } from '../../../core/services/audio-player.service';
import { GameFacadeService } from '../services/game-facade.service';
import { HintService } from '../services/hint.service';
import { AnswerSearchService } from '../services/answer-search.service';
import { AnswerSubmissionService } from '../services/answer-submission.service';
import { SettingsService } from '../../../core/services/settings.service';
import { DeezerSuggestion } from '../services/deezer-autocomplete.service';
import { TrackSlot, SubmitAnswerResponse } from '../../../core/models/game.models';
import { DeezerBadgeComponent } from '../../../shared/deezer-badge.component';
import { GuessTimeChartComponent } from '../../../shared/guess-time-chart/guess-time-chart.component';

export interface AnsweredEvent {
  trackId: number;
  listenedDurationSeconds: number;
  wasExtended: boolean;
  artistAnswer: string | null;
  titleAnswer: string | null;
}

@Component({
  selector: 'app-blind-round',
  imports: [FormsModule, DecimalPipe, TranslatePipe, DeezerBadgeComponent, GuessTimeChartComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './blind-round.component.html',
  providers: [HintService, AnswerSearchService, AnswerSubmissionService],
})
export class BlindRoundComponent implements OnDestroy {
  readonly track = input.required<TrackSlot>();
  readonly isLast = input(false);
  readonly sessionId = input(0);
  readonly minListenedSeconds = input<number | null>(null);
  readonly answered = output<AnsweredEvent>();
  readonly nextTrack = output<void>();

  protected readonly audio = inject(AudioPlayerService);
  private readonly settings = inject(SettingsService);
  private readonly gameService = inject(GameFacadeService);
  private readonly hintService = inject(HintService);
  private readonly search = inject(AnswerSearchService);
  private readonly submission = inject(AnswerSubmissionService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly durations = computed(() => {
    const all = this.settings.allowedDurations();
    const min = this.minListenedSeconds();
    if (min == null) return all;
    return all.filter(d => d >= min);
  });
  protected readonly chosenDuration = signal(0);
  /** Morceau déjà lancé automatiquement — l'autoplay ne se déclenche qu'une fois par morceau. */
  private autoPlayedTrackId: number | null = null;
  protected readonly pendingConfirm = this.submission.pendingConfirm;
  protected readonly isSubmitting = this.submission.isSubmitting;
  protected readonly displayedScore = this.submission.displayedScore;
  protected readonly submitFailed = this.submission.submitFailed;
  protected readonly result = this.submission.result;

  /** Dernière réponse envoyée — permet à `retry()` de la renvoyer telle quelle après un échec. */
  private lastSubmission: Pick<AnsweredEvent, 'listenedDurationSeconds' | 'wasExtended' | 'artistAnswer' | 'titleAnswer'> | null = null;

  // Recherche/autocomplete — délégués à AnswerSearchService (masqué avant déblocage, pas juste
  // désactivé). `searchQuery` reste un accesseur pour garder `[(ngModel)]="searchQuery"` inchangé.
  protected readonly suggestions = this.search.suggestions;
  protected readonly showSuggestions = this.search.showSuggestions;
  protected readonly highlightedIndex = this.search.highlightedIndex;

  protected get searchQuery(): string { return this.search.searchQuery; }
  protected set searchQuery(value: string) { this.search.searchQuery = value; }

  // Indices (hints) — demande/révélation déléguées à HintService (masqué avant déblocage,
  // pas juste désactivé). Ces membres sont des alias directs des signals du service.
  protected readonly hint1Revealed = this.hintService.hint1Revealed;
  protected readonly hint2Revealed = this.hintService.hint2Revealed;
  protected readonly hintYear = this.hintService.hintYear;
  protected readonly hintArtistMasked = this.hintService.hintArtistMasked;
  protected readonly hintRequestPending = this.hintService.hintRequestPending;

  protected readonly hint1Unlocked = computed(() => {
    const threshold = this.settings.hintUnlockDurations()[0];
    return threshold != null && this.chosenDuration() >= threshold;
  });
  protected readonly hint2Unlocked = computed(() => {
    const threshold = this.settings.hintUnlockDurations()[1];
    return threshold != null && this.chosenDuration() >= threshold;
  });
  protected readonly hint1Locked = computed(() => this.hint1Unlocked() && !this.hint1Revealed());
  protected readonly hint2Locked = computed(() => this.hint2Unlocked() && !this.hint2Revealed());

  protected readonly resultHintUsed = computed(() => (this.result()?.hintLevelUsed ?? 0) > 0);
  protected readonly resultHintPercent = computed(() => this.result()?.hintPenaltyPercentApplied ?? 0);

  protected readonly nextDuration = computed(() => {
    const durations = this.durations();
    const idx = durations.indexOf(this.chosenDuration());
    return idx >= 0 && idx < durations.length - 1 ? durations[idx + 1] : null;
  });

  /** Dernier palier autorisé (après filtrage anti-cheat) — sert de plafond pour les repères sur la barre. */
  protected readonly maxDuration = computed(() => {
    const durations = this.durations();
    return durations.length > 0 ? durations[durations.length - 1] : 0;
  });

  /** Repondère audio.progress() (0→1 relatif au palier choisi) sur l'échelle de la barre (0→maxDuration). */
  protected readonly scaleRatio = computed(() => {
    const max = this.maxDuration();
    return max > 0 ? this.chosenDuration() / max : 0;
  });

  constructor() {
    // Démarre automatiquement l'écoute au premier palier autorisé dès que le morceau est prêt — plus de choix initial.
    // Une seule fois par morceau : si le lecteur retombait à 'idle' en cours de round (échec de
    // lecture), l'autoplay ramènerait le joueur au premier palier en écrasant le palier choisi
    // (cf. piège 44 CLAUDE.md). Les relectures voulues par le joueur (↺, « écouter plus »,
    // « Réessayer ») passent par d'autres chemins et ne sont pas concernées.
    effect(() => {
      const track = this.track();
      if (this.audio.isIdle() && track.previewUrl && this.autoPlayedTrackId !== track.id) {
        const first = this.durations()[0];
        if (first) {
          this.autoPlayedTrackId = track.id;
          this.startPlay(first);
        }
      }
    });

    // Dès que le joueur s'engage sur un palier (startPlay/listenMore), mémoriser la durée
    // choisie côté serveur — sans attendre que l'audio ait fini de la jouer. Nécessaire pour
    // que le déblocage d'indice (basé sur ce même champ côté back) suive le palier choisi et
    // non la fin de lecture, cf. RequestHint/Handler.cs.
    effect(() => {
      const dur = this.chosenDuration();
      const sid = this.sessionId();
      const tid = this.track().id;
      if (sid > 0 && tid > 0 && dur > 0) {
        this.gameService.updateListening(sid, tid, dur).pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
      }
    });
  }

  clearSearch(event: MouseEvent): void {
    event.preventDefault();
    this.search.clearAll();
    this.submission.setPendingConfirm(null);
  }

  onQueryChange(q: string): void {
    this.search.onQueryChange(q);
    this.submission.setPendingConfirm(null);
  }

  protected openSuggestions(): void {
    this.search.openSuggestions();
  }

  protected highlightSuggestion(index: number): void {
    this.search.highlight(index);
  }

  protected cancelConfirm(): void {
    this.submission.setPendingConfirm(null);
  }

  /** Bouton « Passer (0 pts) » : demande confirmation avant d'envoyer une réponse vide. */
  protected askSkip(): void {
    this.submission.setPendingConfirm('skip');
  }

  onBlur(): void {
    this.search.onBlur();
  }

  onSearchKeydown(event: KeyboardEvent): void {
    this.search.onSearchKeydown(event);
  }

  selectSuggestion(s: DeezerSuggestion): void {
    this.search.selectSuggestion(s);
  }

  skipNoPreview(): void {
    // `chosenDuration()` reste à 0 pour un morceau réellement sans preview (jamais verrouillé
    // côté serveur), mais peut être non nul si l'auto-play a déjà appelé updateListening avant
    // d'échouer (état d'erreur, cf. piège E4 CLAUDE.md) — soumettre 0 dans ce cas serait rejeté
    // (400 listened_duration_below_verified_minimum, anti-triche SubmitAnswer/Handler.cs).
    this.emitAnswer({
      listenedDurationSeconds: this.chosenDuration(),
      wasExtended: false,
      artistAnswer: null,
      titleAnswer: null,
    });
  }

  startPlay(duration: number): void {
    this.chosenDuration.set(duration);
    this.audio.play(this.track().previewUrl, duration);
  }

  /** Relance la lecture après un échec (`audio.isError()`) — cf. piège E4 CLAUDE.md. */
  protected retryPlayback(): void {
    this.startPlay(this.chosenDuration() || this.durations()[0]);
  }

  listenMore(): void {
    const next = this.nextDuration();
    if (next) {
      this.chosenDuration.set(next);
      this.audio.extend(next);
    }
  }

  useHint1(): void {
    this.hintService.useHint1(this.sessionId(), this.track().id);
  }

  useHint2(): void {
    this.hintService.useHint2(this.sessionId(), this.track().id);
  }

  submit(): void {
    this.submission.setPendingConfirm(null);
    const answer = this.search.resolveAnswer();

    // Confirmation inline si champ vide
    if (!answer.artist && !answer.title) {
      this.submission.setPendingConfirm('empty');
      return;
    }

    this.doSubmit(answer);
  }

  /** Valide la confirmation inline en attente (« réponse vide » ou « Passer »). */
  protected confirmPending(): void {
    const kind = this.submission.pendingConfirm();
    this.submission.setPendingConfirm(null);
    this.doSubmit(kind === 'skip' ? { artist: null, title: null } : this.search.resolveAnswer());
  }

  private doSubmit(answer: { artist: string | null; title: string | null }): void {
    this.submission.startSubmitting();
    this.emitAnswer({
      listenedDurationSeconds: this.chosenDuration(),
      wasExtended: this.audio.extended(),
      artistAnswer: answer.artist,
      titleAnswer: answer.title,
    });
  }

  private emitAnswer(overrides: Pick<AnsweredEvent, 'listenedDurationSeconds' | 'wasExtended' | 'artistAnswer' | 'titleAnswer'>): void {
    this.lastSubmission = overrides;
    this.answered.emit({ trackId: this.track().id, ...overrides });
  }

  /** Renvoie la dernière réponse après un échec d'envoi (`submitFailed`) — cf. piège E5 CLAUDE.md. */
  protected retry(): void {
    if (!this.lastSubmission) return;
    this.submission.startSubmitting();
    this.answered.emit({ trackId: this.track().id, ...this.lastSubmission });
  }

  setResult(r: SubmitAnswerResponse): void {
    this.submission.setResult(r);
    // Rien à rejouer si l'aperçu n'a jamais réellement joué (ex: « Passer » cliqué depuis
    // l'état d'erreur) — éviter une 2e tentative de lecture inutile sur une source qui a déjà
    // échoué, cf. piège E4 CLAUDE.md.
    if (this.track().previewUrl && this.chosenDuration() > 0 && !this.audio.isError()) {
      this.audio.replayFull();
    }
  }

  /** La soumission a échoué après les tentatives automatiques du back — cf. `GameService.submitAnswer`. */
  setSubmitError(): void {
    this.submission.setError();
  }

  next(): void {
    this.audio.reset();
    this.submission.reset();
    this.search.reset();
    this.chosenDuration.set(0);
    this.hintService.reset();
    this.lastSubmission = null;
    this.nextTrack.emit();
  }

  ngOnDestroy(): void {
    this.audio.reset();
  }
}
