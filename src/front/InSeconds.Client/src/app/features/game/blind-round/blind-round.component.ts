import {
  Component, input, output, inject, signal, computed, effect, OnDestroy,
  ChangeDetectionStrategy
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DecimalPipe } from '@angular/common';
import { Subject } from 'rxjs';
import { AudioPlayerService } from '../../../core/services/audio-player.service';
import { GameService } from '../../../core/services/game.service';
import { SettingsService } from '../../../core/services/settings.service';
import { DeezerSearchService, DeezerSuggestion } from '../../../core/services/deezer-search.service';
import { TrackSlot, SubmitAnswerResponse } from '../../../core/models/game.models';

function countUp(target: number, setter: (v: number) => void, duration = 600): void {
  if (target === 0) { setter(0); return; }
  // Pas d'animation si mouvement réduit demandé (accessibilité) ou en contexte de test
  // (flag __disableAnimations posé par Playwright) : l'animation rAF ne tourne pas sous
  // une horloge figée par page.clock, le score final doit donc être posé immédiatement.
  const reduced =
    (typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches)
    || (typeof window !== 'undefined' && (window as { __disableAnimations?: boolean }).__disableAnimations === true);
  if (reduced) { setter(target); return; }
  const start = performance.now();
  const step = (now: number) => {
    const t = Math.min((now - start) / duration, 1);
    setter(Math.round(t * t * target));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

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
  changeDetection: ChangeDetectionStrategy.Eager,
  template: `
    <div class="flex flex-col gap-4">

      <!-- ── Zone player ── -->
      @if (!result()) {
        <div class="rounded-2xl p-5 space-y-5" style="background:#0f0f1a;border:1px solid rgba(255,255,255,0.07)">

          <!-- Paliers -->
          @if (audio.isIdle()) {
            @if (track().previewUrl) {
              <p class="text-center text-sm" style="color:#475569">Combien de secondes veux-tu écouter ?</p>
              <div class="flex flex-wrap gap-2 justify-center">
                @for (d of durations(); track d) {
                  <div class="relative" (mouseenter)="hoveredDuration.set(d)" (mouseleave)="hoveredDuration.set(null)">
                    @if (hoveredDuration() === d && scoreForDuration(d) != null) {
                      <div class="absolute -top-8 left-1/2 -translate-x-1/2 px-2 py-1 rounded-lg text-xs font-bold whitespace-nowrap pointer-events-none"
                           style="background:#312e81;color:#c7d2fe;z-index:10">
                        {{ scoreForDuration(d) }} pts
                      </div>
                    }
                    <button
                      (click)="startPlay(d)"
                      class="px-5 py-3 rounded-xl font-semibold text-sm transition active:scale-95 touch-manipulation"
                      style="background:#6366f1;color:#fff">
                      {{ d }}s
                    </button>
                  </div>
                }
              </div>
            } @else {
              <p class="text-center text-sm" style="color:#475569">Aperçu non disponible pour ce morceau.</p>
              <div class="flex justify-center">
                <button
                  (click)="skipNoPreview()"
                  class="px-5 py-3 rounded-xl font-semibold text-sm transition active:scale-95 touch-manipulation"
                  style="background:#334155;color:#94a3b8">
                  Passer (0 pts)
                </button>
              </div>
            }
          }

          <!-- Lecture en cours -->
          @if (!audio.isIdle()) {
            <div class="space-y-4">

              <!-- Chrono -->
              <p class="text-center text-2xl font-bold tabular-nums"
                 [style.color]="audio.isPlaying() ? '#34d399' : '#475569'"
                 style="letter-spacing:-0.02em">
                {{ audio.state() === 'loading' ? '…'
                 : audio.isPlaying()           ? (audio.progress() * chosenDuration() | number:'1.1-1') + 's / ' + chosenDuration() + 's'
                 :                               chosenDuration() + 's / ' + chosenDuration() + 's' }}
              </p>

              <!-- Barre de progression -->
              <div class="relative w-full h-px rounded-full" style="background:#1e1e2e">
                <div class="absolute top-0 left-0 h-px rounded-full transition-none"
                     [style.width.%]="audio.progress() * 100"
                     [style.background]="audio.isPlaying() ? '#34d399' : '#475569'">
                </div>
                <div class="absolute top-1/2 -translate-y-1/2 w-2.5 h-2.5 rounded-full transition-none"
                     [style.left.%]="audio.progress() * 100"
                     [style.background]="audio.isPlaying() ? '#34d399' : '#475569'"
                     style="margin-left:-5px;box-shadow:0 0 6px rgba(52,211,153,0.4)">
                </div>
              </div>

              <!-- Boutons -->
              <div class="flex gap-2 pt-1">
                <button
                  type="button"
                  (click)="audio.play(track().previewUrl, chosenDuration())"
                  class="flex-1 py-3 rounded-xl text-sm font-semibold transition touch-manipulation"
                  style="background:#1e1e2e;color:#94a3b8;border:1px solid rgba(255,255,255,0.06)">
                  ↺ {{ chosenDuration() }}s
                </button>

                @if (nextDuration()) {
                  <button
                    type="button"
                    (click)="listenMore()"
                    class="flex-1 py-3 rounded-xl text-sm font-semibold transition touch-manipulation"
                    style="background:#312e81;color:#c7d2fe;border:1px solid rgba(99,102,241,0.3)">
                    ▶ jusqu'à {{ nextDuration() }}s
                  </button>
                }
              </div>

            </div>
          }

        </div>
      }

      <!-- ── Zone saisie ── -->
      @if (!audio.isIdle() && !result()) {
        <form (ngSubmit)="submit()" class="space-y-3">

          <div class="relative">
            <input
              [(ngModel)]="searchQuery"
              name="search"
              placeholder="Artiste — Titre"
              autocomplete="off"
              (ngModelChange)="onQueryChange($event)"
              (blur)="onBlur()"
              (focus)="showSuggestions.set(true)"
              class="w-full pl-4 py-3.5 rounded-xl text-sm transition"
              [style.paddingRight]="searchQuery ? '2.5rem' : '1rem'"
              style="background:#0f0f1a;color:#e2e8f0;border:1px solid rgba(255,255,255,0.08);outline:none"
              onfocus="this.style.borderColor='rgba(99,102,241,0.5)'"
              onblur="this.style.borderColor='rgba(255,255,255,0.08)'"
            />
            @if (searchQuery) {
              <button
                type="button"
                (mousedown)="clearSearch($event)"
                class="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full transition touch-manipulation"
                style="color:#475569;background:rgba(255,255,255,0.06)"
                onmouseenter="this.style.color='#94a3b8'" onmouseleave="this.style.color='#475569'">
                ✕
              </button>
            }

            @if (showSuggestions() && suggestions().length > 0) {
              <ul class="absolute z-10 w-full mt-1 rounded-xl overflow-hidden shadow-2xl"
                  style="background:#0f0f1a;border:1px solid rgba(255,255,255,0.08)">
                @for (s of suggestions(); track s.artist + s.title) {
                  <li
                    (mousedown)="selectSuggestion(s)"
                    class="px-4 py-3 cursor-pointer text-sm transition"
                    style="border-bottom:1px solid rgba(255,255,255,0.04)"
                    onmouseenter="this.style.background='rgba(255,255,255,0.03)'"
                    onmouseleave="this.style.background='transparent'">
                    <span class="font-medium" style="color:#e2e8f0">{{ s.artist }}</span>
                    <span style="color:#334155"> — </span>
                    <span style="color:#64748b">{{ s.title }}</span>
                  </li>
                }
              </ul>
            }
          </div>

          @if (showEmptyConfirm()) {
            <div class="rounded-xl px-4 py-3 space-y-3"
                 style="background:rgba(120,53,15,0.2);border:1px solid rgba(180,83,9,0.3)">
              <p class="text-sm text-center" style="color:#fbbf24">Tu n'as rien saisi. Valider quand même ?</p>
              <div class="flex gap-2">
                <button
                  type="button"
                  (click)="showEmptyConfirm.set(false)"
                  class="flex-1 py-2.5 rounded-lg text-sm font-semibold transition touch-manipulation"
                  style="background:#1e1e2e;color:#64748b;border:1px solid rgba(255,255,255,0.06)">
                  Annuler
                </button>
                <button
                  type="button"
                  (click)="confirmSubmit()"
                  class="flex-1 py-2.5 rounded-lg text-sm font-semibold transition touch-manipulation"
                  style="background:#92400e;color:#fef3c7">
                  Valider quand même
                </button>
              </div>
            </div>
          } @else {
            <button
              type="submit"
              [disabled]="isSubmitting()"
              class="w-full py-3.5 rounded-xl text-sm font-bold tracking-wide transition touch-manipulation disabled:opacity-60"
              style="background:#059669;color:#fff;letter-spacing:0.03em">
              {{ isSubmitting() ? '…' : 'Valider' }}
            </button>
          }
        </form>
      }

      <!-- ── Résultat ── -->
      @if (result(); as r) {
        <div class="flex flex-col items-center gap-5 text-center pt-2">

          @if (track().coverUrl) {
            <img [src]="track().coverUrl" alt="Pochette"
              class="w-32 h-32 rounded-2xl object-cover"
              style="box-shadow:0 8px 32px rgba(0,0,0,0.6);opacity:0.95" />
          }

          <div class="flex justify-center gap-6">
            <span class="text-base font-bold" [style.color]="r.artistCorrect ? '#34d399' : '#f87171'">
              {{ r.artistCorrect ? '✓' : '✗' }} Artiste
            </span>
            <span class="text-base font-bold" [style.color]="r.titleCorrect ? '#34d399' : '#f87171'">
              {{ r.titleCorrect ? '✓' : '✗' }} Titre
            </span>
          </div>

          <div class="space-y-0.5">
            <p class="text-xs font-semibold tracking-widest uppercase" style="color:#334155">Bonne réponse</p>
            <p class="text-base font-medium" style="color:#cbd5e1">{{ r.correctArtist }} — {{ r.correctTitle }}</p>
          </div>

          <p class="font-bold tabular-nums"
             [style.color]="r.score > 0 ? '#34d399' : '#475569'"
             style="font-size:3rem;line-height:1;letter-spacing:-0.03em">
            +{{ displayedScore() }}
            <span class="text-lg font-normal" style="color:#334155"> pts</span>
          </p>

          <div class="flex justify-center flex-wrap gap-4 text-xs" style="color:#334155">
            <span>Ton temps : <span style="color:#64748b">{{ r.listenedDurationSeconds }}s</span></span>
            @if (r.averageSecondsWhenCorrect != null) {
              <span>Moy. : <span style="color:#64748b">{{ r.averageSecondsWhenCorrect!.toFixed(1) }}s</span></span>
            }
            <span>Pas trouvé : <span style="color:#64748b">{{ r.failureRatePercent.toFixed(0) }}%</span></span>
          </div>

          @if (showNetworkError()) {
            <div class="toast-enter w-full rounded-xl px-4 py-3 text-sm text-center"
                 style="background:rgba(127,29,29,0.5);border:1px solid rgba(248,113,113,0.3);color:#fca5a5">
              Erreur réseau — la réponse n'a pas pu être enregistrée.
            </div>
          }

          <button
            (click)="next()"
            class="w-full py-3.5 rounded-xl text-sm font-bold tracking-wide transition touch-manipulation"
            style="background:#6366f1;color:#fff;letter-spacing:0.03em">
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
  readonly sessionId = input(0);
  readonly minListenedSeconds = input<number | null>(null);
  readonly answered = output<AnsweredEvent>();
  readonly nextTrack = output<void>();

  protected readonly audio = inject(AudioPlayerService);
  private readonly settings = inject(SettingsService);
  private readonly gameService = inject(GameService);
  private readonly deezerSearch = inject(DeezerSearchService);

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
    this.deezerSearch.search(this.query$).subscribe(s => this.suggestions.set(s));

    // Quand le timer s'arrête (état finished, pas encore de résultat), mémoriser la durée écoutée
    effect(() => {
      if (this.audio.state() === 'finished' && !this.result()) {
        const sid = this.sessionId();
        const tid = this.track().id;
        const dur = this.chosenDuration();
        if (sid > 0 && tid > 0 && dur > 0) {
          this.gameService.updateListening(sid, tid, dur).subscribe();
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
      this.audio.play(this.track().previewUrl, next);
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
