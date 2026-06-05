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
        <div class="text-center space-y-6 py-4">
          <div>
            <p class="text-6xl mb-3">🎧</p>
            <p class="text-slate-400 text-sm">Combien de secondes veux-tu écouter ?</p>
          </div>
          <div class="flex flex-wrap gap-3 justify-center">
            @for (d of durations(); track d) {
              <button
                (click)="startPlay(d)"
                class="px-6 py-4 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-lg font-semibold transition touch-manipulation">
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
      @if (audio.isPlaying() && !result()) {
        <div class="text-center py-4">
          <p class="text-emerald-400 text-xl font-semibold animate-pulse">♫ Écoute en cours…</p>
        </div>
      }

      <!-- Saisie artiste + titre -->
      @if (audio.isFinished() && !result()) {
        <form (ngSubmit)="submit()" class="space-y-4">
          <div class="flex gap-3">
            <button
              type="button"
              (click)="audio.play(track().previewUrl, chosenDuration)"
              class="flex-1 py-3 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-semibold transition touch-manipulation">
              ↺ {{ chosenDuration }}s
            </button>
            @if (nextDuration()) {
              <button
                type="button"
                (click)="listenMore()"
                class="flex-1 py-3 rounded-lg bg-indigo-700 hover:bg-indigo-600 text-white font-semibold transition touch-manipulation">
                ▶ {{ nextDuration() }}s
              </button>
            }
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

          @if (track().coverUrl) {
            <img [src]="track().coverUrl" alt="Pochette"
              class="w-40 h-40 rounded-xl mx-auto object-cover shadow-lg" />
          }

          <div class="flex justify-center gap-6">
            <span [class]="r.artistCorrect ? 'text-emerald-400 text-lg' : 'text-rose-400 text-lg'">
              {{ r.artistCorrect ? '✓' : '✗' }} Artiste
            </span>
            <span [class]="r.titleCorrect ? 'text-emerald-400 text-lg' : 'text-rose-400 text-lg'">
              {{ r.titleCorrect ? '✓' : '✗' }} Titre
            </span>
          </div>
          <p class="text-slate-300 text-sm">
            <span class="text-slate-500">Bonne réponse :</span>
            {{ r.correctArtist }} — {{ r.correctTitle }}
          </p>
          <p [class]="r.score > 0 ? 'text-4xl font-bold text-emerald-400' : 'text-4xl font-bold text-slate-400'">
            +{{ r.score }} pts
          </p>

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

  protected chosenDuration = 0;

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
  }

  listenMore(): void {
    const next = this.nextDuration();
    if (next) {
      this.chosenDuration = next;
      this.audio.play(this.track().previewUrl, next);
    }
  }

  extendPlay(): void {
    const next = this.nextDuration();
    if (next) {
      this.chosenDuration = next;
      this.audio.extend(next);
    }
  }

  submit(): void {
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
    this.audio.play(this.track().previewUrl, 30);
  }

  next(): void {
    this.audio.reset();
    this.result.set(null);
    this.artistAnswer = '';
    this.titleAnswer = '';
    this.chosenDuration = 0;
    this.nextTrack.emit();
  }

  ngOnDestroy(): void {
    this.audio.reset();
  }

}
