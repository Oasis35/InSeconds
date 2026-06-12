import {
  Component, input, output, inject, signal, computed, OnDestroy
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { Subject } from 'rxjs';
import { AudioPlayerService } from '../../../core/services/audio-player.service';
import { SettingsService } from '../../../core/services/settings.service';
import { DeezerSearchService, DeezerSuggestion } from '../../../core/services/deezer-search.service';
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
  imports: [FormsModule, DecimalPipe],
  template: `
    <div class="flex flex-col gap-5">

      <!-- ── Zone player (haut) ── -->
      <div class="bg-slate-800/60 rounded-2xl p-5 space-y-4">

        <!-- Paliers (idle uniquement) -->
        @if (audio.isIdle()) {
          <p class="text-center text-slate-400 text-sm">Combien de secondes veux-tu écouter ?</p>
          <div class="flex flex-wrap gap-2 justify-center">
            @for (d of durations(); track d) {
              <button
                (click)="startPlay(d)"
                class="px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold transition touch-manipulation">
                {{ d }}s
              </button>
            }
          </div>
        }

        <!-- Statut écoute -->
        @if (!audio.isIdle()) {
          <div class="space-y-4">

            <!-- Chrono centré -->
            <p class="text-center text-2xl font-bold tabular-nums"
               [class]="audio.isPlaying() ? 'text-emerald-400' : 'text-slate-300'">
              {{ audio.state() === 'loading' ? '…'
               : audio.isPlaying()           ? (audio.progress() * chosenDuration() | number:'1.1-1') + 's / ' + chosenDuration() + 's'
               :                               chosenDuration() + 's / ' + chosenDuration() + 's' }}
            </p>

            <!-- Barre avec dot -->
            <div class="relative w-full h-1 bg-slate-700 rounded-full mx-auto">
              <div class="absolute top-0 left-0 h-1 rounded-full transition-none"
                   [class]="audio.isPlaying() ? 'bg-emerald-400' : 'bg-slate-500'"
                   [style.width.%]="audio.progress() * 100">
              </div>
              <div class="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full shadow transition-none"
                   [class]="audio.isPlaying() ? 'bg-emerald-400' : 'bg-slate-500'"
                   [style.left.%]="audio.progress() * 100"
                   style="margin-left: -6px">
              </div>
            </div>

            <!-- Boutons -->
            <div class="flex gap-2 pt-1">
              <button
                type="button"
                (click)="mainAction()"
                class="flex-1 py-3 rounded-xl font-semibold transition touch-manipulation"
                [class]="audio.isPlaying()
                  ? 'bg-rose-600 hover:bg-rose-500 text-white'
                  : 'bg-slate-700 hover:bg-slate-600 text-white'">
                {{ audio.isPlaying() ? '✋ Stop' : '↺ Réécouter ' + chosenDuration() + 's' }}
              </button>

              @if (nextDuration()) {
                <button
                  type="button"
                  (click)="listenMore()"
                  class="flex-1 py-3 rounded-xl bg-indigo-700 hover:bg-indigo-600 text-white font-semibold transition touch-manipulation">
                  ▶ Continuer jusqu'à {{ nextDuration() }}s
                </button>
              }
            </div>

          </div>
        }

      </div>

      <!-- ── Zone saisie (bas — toujours présente après choix du palier) ── -->
      @if (!audio.isIdle() && !result()) {
        <form (ngSubmit)="submit()" class="space-y-3">

          <!-- Champ unique avec autocomplete -->
          <div class="relative">
            <input
              [(ngModel)]="searchQuery"
              name="search"
              placeholder="Artiste - Titre"
              autocomplete="off"
              (ngModelChange)="onQueryChange($event)"
              (blur)="onBlur()"
              (focus)="showSuggestions.set(true)"
              class="w-full px-4 py-3 rounded-xl bg-slate-800 text-slate-100 placeholder-slate-500
                     border border-slate-700 focus:outline-none focus:border-indigo-500 text-base transition" />

            <!-- Dropdown suggestions -->
            @if (showSuggestions() && suggestions().length > 0) {
              <ul class="absolute z-10 w-full mt-1 bg-slate-800 border border-slate-700 rounded-xl overflow-hidden shadow-xl">
                @for (s of suggestions(); track s.label) {
                  <li
                    (mousedown)="selectSuggestion(s)"
                    class="px-4 py-3 cursor-pointer hover:bg-slate-700 transition text-sm">
                    <span class="text-slate-200 font-medium">{{ s.artist }}</span>
                    <span class="text-slate-500"> - </span>
                    <span class="text-slate-400">{{ s.title }}</span>
                  </li>
                }
              </ul>
            }
          </div>

          <button
            type="submit"
            [disabled]="audio.isPlaying()"
            class="w-full py-3 rounded-xl font-semibold transition touch-manipulation"
            [class]="audio.isPlaying()
              ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
              : 'bg-emerald-600 hover:bg-emerald-500 text-white'">
            Valider
          </button>
        </form>
      }

      <!-- ── Résultat ── -->
      @if (result(); as r) {
        <div class="space-y-3 text-center">

          @if (track().coverUrl) {
            <img [src]="track().coverUrl" alt="Pochette"
              class="w-36 h-36 rounded-xl mx-auto object-cover shadow-lg" />
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

          <div class="flex justify-center flex-wrap gap-4 text-sm text-slate-500 pt-1">
            <span>Ton temps : <span class="text-slate-300">{{ r.listenedDurationSeconds }}s</span></span>
            @if (r.averageSecondsWhenCorrect != null) {
              <span>Moy. trouvé : <span class="text-slate-300">{{ r.averageSecondsWhenCorrect!.toFixed(1) }}s</span></span>
            }
            <span>N'ont pas trouvé : <span class="text-slate-300">{{ r.failureRatePercent.toFixed(0) }}%</span></span>
          </div>

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
  private readonly deezerSearch = inject(DeezerSearchService);

  protected readonly durations = computed(() => this.settings.allowedDurations());
  protected artistAnswer = '';
  protected titleAnswer = '';
  protected searchQuery = '';
  protected readonly result = signal<SubmitAnswerResponse | null>(null);
  protected readonly chosenDuration = signal(0);
  protected readonly suggestions = signal<DeezerSuggestion[]>([]);
  protected readonly showSuggestions = signal(false);

  private readonly query$ = new Subject<string>();

  protected readonly nextDuration = computed(() => {
    const durations = this.settings.allowedDurations();
    const idx = durations.indexOf(this.chosenDuration());
    return idx >= 0 && idx < durations.length - 1 ? durations[idx + 1] : null;
  });

  constructor() {
    this.deezerSearch.search(this.query$).subscribe(s => this.suggestions.set(s));
  }

  onQueryChange(q: string): void {
    this.query$.next(q);
    this.showSuggestions.set(true);
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
      this.audio.play(this.track().previewUrl, next);
    }
  }

  submit(): void {
    // Si pas de suggestion sélectionnée, on tente de splitter sur " — " ou " - "
    if (!this.artistAnswer && !this.titleAnswer && this.searchQuery.trim()) {
      const parts = this.searchQuery.split(' - ');
      this.artistAnswer = parts[0]?.trim() ?? '';
      this.titleAnswer  = parts.slice(1).join(' - ').trim();
    }

    const { listenedSeconds, wasExtended } = this.audio.stop();
    this.answered.emit({
      trackId:                 this.track().id,
      listenedDurationSeconds: listenedSeconds || this.chosenDuration(),
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
    this.searchQuery = '';
    this.suggestions.set([]);
    this.chosenDuration.set(0);
    this.nextTrack.emit();
  }

  ngOnDestroy(): void {
    this.audio.reset();
  }
}
