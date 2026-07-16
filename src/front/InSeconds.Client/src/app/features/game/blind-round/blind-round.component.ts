import {
  Component, input, output, inject, signal, computed, effect, OnDestroy,
  ChangeDetectionStrategy, DestroyRef
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { Subject } from 'rxjs';
import { AudioPlayerService } from '../../../core/services/audio-player.service';
import { GameFacadeService } from '../services/game-facade.service';
import { SettingsService } from '../../../core/services/settings.service';
import { DeezerAutocompleteService, DeezerSuggestion } from '../services/deezer-autocomplete.service';
import { TrackSlot, SubmitAnswerResponse } from '../../../core/models/game.models';
import { countUp } from '../../../core/count-up';

export interface AnsweredEvent {
  trackId: number;
  listenedDurationSeconds: number;
  wasExtended: boolean;
  artistAnswer: string | null;
  titleAnswer: string | null;
}

@Component({
  selector: 'app-blind-round',
  imports: [FormsModule, DecimalPipe, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './blind-round.component.html',
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
  private readonly deezerSearch = inject(DeezerAutocompleteService);
  private readonly destroyRef = inject(DestroyRef);

  protected readonly durations = computed(() => {
    const all = this.settings.allowedDurations();
    const min = this.minListenedSeconds();
    if (min == null) return all;
    return all.filter(d => d >= min);
  });
  protected artistAnswer = '';
  protected titleAnswer = '';
  protected searchQuery = '';
  protected readonly result = signal<SubmitAnswerResponse | null>(null);
  protected readonly chosenDuration = signal(0);
  protected readonly suggestions = signal<DeezerSuggestion[]>([]);
  protected readonly showSuggestions = signal(false);
  protected readonly showEmptyConfirm = signal(false);
  protected readonly isSubmitting = signal(false);
  protected readonly hoveredDuration = signal<number | null>(null);
  protected readonly displayedScore = signal(0);
  protected readonly showNetworkError = signal(false);
  private networkErrorTimer: ReturnType<typeof setTimeout> | null = null;

  private readonly query$ = new Subject<string>();

  protected readonly nextDuration = computed(() => {
    const durations = this.settings.allowedDurations();
    const idx = durations.indexOf(this.chosenDuration());
    return idx >= 0 && idx < durations.length - 1 ? durations[idx + 1] : null;
  });

  constructor() {
    this.deezerSearch.search(this.query$).pipe(takeUntilDestroyed(this.destroyRef)).subscribe(s => this.suggestions.set(s));

    // Quand le timer s'arrête (état finished, pas encore de résultat), mémoriser la durée écoutée
    effect(() => {
      if (this.audio.state() === 'finished' && !this.result()) {
        const sid = this.sessionId();
        const tid = this.track().id;
        const dur = this.chosenDuration();
        if (sid > 0 && tid > 0 && dur > 0) {
          this.gameService.updateListening(sid, tid, dur).pipe(takeUntilDestroyed(this.destroyRef)).subscribe();
        }
      }
    });
  }

  protected scoreForDuration(d: number): number | null {
    return this.settings.durationScores()[d] ?? null;
  }

  clearSearch(event: MouseEvent): void {
    event.preventDefault();
    this.searchQuery = '';
    this.artistAnswer = '';
    this.titleAnswer = '';
    this.suggestions.set([]);
    this.showSuggestions.set(false);
    this.showEmptyConfirm.set(false);
  }

  onQueryChange(q: string): void {
    this.artistAnswer = '';
    this.titleAnswer = '';
    this.query$.next(q);
    this.showSuggestions.set(true);
    this.showEmptyConfirm.set(false);
  }

  onBlur(): void {
    setTimeout(() => this.showSuggestions.set(false), 150);
  }

  selectSuggestion(s: DeezerSuggestion): void {
    this.artistAnswer = s.artist;
    this.titleAnswer = s.title;
    this.searchQuery = `${s.artist} - ${s.title}`;
    this.showSuggestions.set(false);
  }

  skipNoPreview(): void {
    this.answered.emit({
      trackId: this.track().id,
      listenedDurationSeconds: 0,
      wasExtended: false,
      artistAnswer: null,
      titleAnswer: null,
    });
  }

  startPlay(duration: number): void {
    this.chosenDuration.set(duration);
    this.audio.play(this.track().previewUrl, duration);
  }

  mainAction(): void {
    if (this.audio.isPlaying()) {
      this.audio.stop();
    } else {
      this.audio.play(this.track().previewUrl, this.chosenDuration());
    }
  }

  listenMore(): void {
    const next = this.nextDuration();
    if (next) {
      this.chosenDuration.set(next);
      this.audio.extend(next);
    }
  }

  submit(): void {
    // Si pas de suggestion sélectionnée, tenter de splitter sur " - "
    if (!this.artistAnswer && !this.titleAnswer && this.searchQuery.trim()) {
      const parts = this.searchQuery.split(' - ');
      this.artistAnswer = parts[0]?.trim() ?? '';
      this.titleAnswer  = parts.slice(1).join(' - ').trim();
    }

    // Confirmation inline si champ vide
    if (!this.artistAnswer.trim() && !this.titleAnswer.trim()) {
      this.showEmptyConfirm.set(true);
      return;
    }

    this.doSubmit();
  }

  protected confirmSubmit(): void {
    this.showEmptyConfirm.set(false);
    this.doSubmit();
  }

  private doSubmit(): void {
    this.isSubmitting.set(true);
    const wasExtended = this.audio.extended();
    this.answered.emit({
      trackId:                 this.track().id,
      listenedDurationSeconds: this.chosenDuration(),
      wasExtended,
      artistAnswer: this.artistAnswer.trim() || null,
      titleAnswer:  this.titleAnswer.trim() || null,
    });
  }

  setResult(r: SubmitAnswerResponse, isNetworkError = false): void {
    this.isSubmitting.set(false);
    this.result.set(r);
    this.displayedScore.set(0);
    countUp(r.score, v => this.displayedScore.set(v));
    if (isNetworkError) {
      this.showNetworkError.set(true);
      if (this.networkErrorTimer) clearTimeout(this.networkErrorTimer);
      this.networkErrorTimer = setTimeout(() => {
        this.showNetworkError.set(false);
        this.networkErrorTimer = null;
      }, 4000);
    }
    if (this.track().previewUrl && this.chosenDuration() > 0) {
      this.audio.replayFull();
    }
  }

  next(): void {
    this.audio.reset();
    this.result.set(null);
    this.displayedScore.set(0);
    this.artistAnswer = '';
    this.titleAnswer = '';
    this.searchQuery = '';
    this.suggestions.set([]);
    this.chosenDuration.set(0);
    this.isSubmitting.set(false);
    this.showNetworkError.set(false);
    if (this.networkErrorTimer) { clearTimeout(this.networkErrorTimer); this.networkErrorTimer = null; }
    this.nextTrack.emit();
  }

  ngOnDestroy(): void {
    this.audio.reset();
    if (this.networkErrorTimer) { clearTimeout(this.networkErrorTimer); this.networkErrorTimer = null; }
  }
}
