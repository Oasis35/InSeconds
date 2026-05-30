import {
  Component, input, output, inject, signal, computed, OnDestroy
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AudioPlayerService } from '../../../core/services/audio-player.service';
import { SettingsService } from '../../../core/services/settings.service';
import { TrackSlot, SubmitAnswerResponse } from '../../../core/models/game.models';

export interface AnsweredEvent {
  trackId: number;
  listenedDurationSeconds: number;
  wasExtended: boolean;
  artistAnswer: string | null;
  titleAnswer: string | null;
}

@Component({
  selector: 'app-blind-round',
  imports: [FormsModule],
  template: `
    <div class="space-y-6">

      <!-- Choix du palier -->
      @if (audio.isIdle()) {
        <div class="text-center space-y-4">
          <p class="text-slate-400 text-sm">Combien de secondes veux-tu écouter ?</p>
          <div class="flex flex-wrap gap-2 justify-center">
            @for (d of durations(); track d) {
              <button
                (click)="startPlay(d)"
                class="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition touch-manipulation">
                {{ d }}s
              </button>
            }
          </div>
        </div>
      }

      <!-- Chargement -->
      @if (audio.state() === 'loading') {
        <p class="text-center text-slate-400 animate-pulse">Chargement…</p>
      }

      <!-- En écoute -->
      @if (audio.isPlaying()) {
        <div class="text-center space-y-4">
          <p class="text-emerald-400 font-semibold">🎵 Écoute en cours…</p>
          @if (!audio.extended() && nextDuration()) {
            <button
              (click)="extendPlay()"
              class="underline text-slate-400 hover:text-slate-200 text-sm touch-manipulation">
              Prolonger jusqu'à {{ nextDuration() }}s
            </button>
          }
        </div>
      }

      <!-- Saisie artiste + titre -->
      @if (audio.isFinished() && !result()) {
        <form (ngSubmit)="submit()" class="space-y-4">
          <div class="flex justify-between text-sm text-slate-400">
            <span>Piste {{ track().position }} / 10</span>
            <span [class.text-rose-400]="timerSeconds() <= 5">
              ⏱ {{ timerSeconds() }}s
            </span>
          </div>

          <input
            [(ngModel)]="artistAnswer"
            name="artist"
            placeholder="Artiste"
            autocomplete="off"
            class="w-full px-4 py-3 rounded-lg bg-slate-800 text-slate-100 placeholder-slate-500
                   border border-slate-700 focus:outline-none focus:border-indigo-500 text-base" />

          <input
            [(ngModel)]="titleAnswer"
            name="title"
            placeholder="Titre"
            autocomplete="off"
            class="w-full px-4 py-3 rounded-lg bg-slate-800 text-slate-100 placeholder-slate-500
                   border border-slate-700 focus:outline-none focus:border-indigo-500 text-base" />

          <button
            type="submit"
            class="w-full py-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold
                   transition touch-manipulation">
            Valider
          </button>
        </form>
      }

      <!-- Résultat -->
      @if (result(); as r) {
        <div class="space-y-3 text-center">
          <div class="flex justify-center gap-4">
            <span [class]="r.artistCorrect ? 'text-emerald-400' : 'text-rose-400'">
              {{ r.artistCorrect ? '✓' : '✗' }} Artiste
            </span>
            <span [class]="r.titleCorrect ? 'text-emerald-400' : 'text-rose-400'">
              {{ r.titleCorrect ? '✓' : '✗' }} Titre
            </span>
          </div>
          <p class="text-slate-300 text-sm">
            <span class="text-slate-500">Bonne réponse :</span>
            {{ r.correctArtist }} — {{ r.correctTitle }}
          </p>
          <p class="text-2xl font-bold text-white">+{{ r.score }} pts</p>
          <button
            (click)="next()"
            class="mt-2 px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white
                   font-semibold transition touch-manipulation">
            {{ isLast() ? 'Voir le résultat' : 'Piste suivante →' }}
          </button>
        </div>
      }

    </div>
  `,
})
export class BlindRoundComponent implements OnDestroy {
  readonly track = input.required<TrackSlot>();
  readonly isLast = input(false);
  readonly answered = output<AnsweredEvent>();
  readonly nextTrack = output<void>();

  protected readonly audio = inject(AudioPlayerService);
  private readonly settings = inject(SettingsService);

  protected readonly durations = computed(() => this.settings.allowedDurations());
  protected artistAnswer = '';
  protected titleAnswer = '';
  protected readonly result = signal<SubmitAnswerResponse | null>(null);
  protected readonly timerSeconds = signal(this.settings.guessTimerSeconds());

  private chosenDuration = 0;
  private timerInterval: ReturnType<typeof setInterval> | null = null;

  protected readonly nextDuration = computed(() => {
    const durations = this.settings.allowedDurations();
    const idx = durations.indexOf(this.chosenDuration);
    return idx >= 0 && idx < durations.length - 1
      ? durations[idx + 1]
      : null;
  });

  startPlay(duration: number): void {
    this.chosenDuration = duration;
    this.audio.play(this.track().previewUrl, duration);
    this.audio.state; // trigger change detection
    // Quand l'audio se termine, démarrer le timer de saisie
    this.waitForFinished();
  }

  extendPlay(): void {
    const next = this.nextDuration();
    if (next) {
      this.chosenDuration = next;
      this.audio.extend(next);
    }
  }

  submit(): void {
    this.stopTimer();
    const { listenedSeconds, wasExtended } = this.audio.stop();

    this.answered.emit({
      trackId:                this.track().id,
      listenedDurationSeconds: listenedSeconds || this.chosenDuration,
      wasExtended,
      artistAnswer: this.artistAnswer.trim() || null,
      titleAnswer:  this.titleAnswer.trim() || null,
    });
  }

  setResult(r: SubmitAnswerResponse): void {
    this.result.set(r);
    this.stopTimer();
  }

  next(): void {
    this.audio.reset();
    this.result.set(null);
    this.artistAnswer = '';
    this.titleAnswer = '';
    this.chosenDuration = 0;
    this.timerSeconds.set(this.settings.guessTimerSeconds());
    this.nextTrack.emit();
  }

  ngOnDestroy(): void {
    this.stopTimer();
    this.audio.reset();
  }

  private waitForFinished(): void {
    const check = setInterval(() => {
      if (this.audio.isFinished()) {
        clearInterval(check);
        this.startGuessTimer();
      }
    }, 100);
  }

  private startGuessTimer(): void {
    this.timerSeconds.set(this.settings.guessTimerSeconds());
    this.timerInterval = setInterval(() => {
      const remaining = this.timerSeconds() - 1;
      this.timerSeconds.set(remaining);
      if (remaining <= 0) this.submit();
    }, 1000);
  }

  private stopTimer(): void {
    if (this.timerInterval !== null) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }
}
