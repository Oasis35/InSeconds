import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { RoundPhase } from '../domain/track-round';

/**
 * Le lecteur de la manche : chronomètre, barre de progression avec un repère à chaque palier,
 * « ↺ » pour réécouter, « ▶ Xs » pour écouter plus. Remplace aussi la zone quand l'extrait manque
 * ou que la lecture échoue : jamais de boucle silencieuse (piège 33), le joueur choisit
 * « Réessayer » ou « Passer ».
 */
@Component({
  selector: 'app-round-player',
  imports: [DecimalPipe, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="p-5 space-y-5" style="background:var(--bg-surface);border:1px solid var(--border-medium);border-radius:28px 8px 28px 8px">
      @switch (phase()) {
        @case ('no-preview') {
          <p class="text-center text-sm" style="color:var(--text-muted)">{{ 'gameplay.round.noPreview' | translate }}</p>
          <div class="flex justify-center">
            <button type="button" (click)="skip.emit()" class="px-5 py-3 rounded-xl font-bold uppercase text-sm transition active:scale-95 touch-manipulation"
              style="font-family:var(--font-display);letter-spacing:0.04em;border:1.5px solid rgb(var(--rgb-accent-2) / 0.7);background:transparent;color:var(--color-accent-2)">
              {{ 'gameplay.round.skip' | translate }}
            </button>
          </div>
        }
        @case ('audio-error') {
          <div class="space-y-4 text-center">
            <p role="alert" class="text-sm" style="color:var(--text-error)">{{ 'gameplay.round.playbackError' | translate }}</p>
            <div class="flex justify-center gap-3">
              <button type="button" (click)="retry.emit()" class="px-5 py-3 rounded-xl font-bold uppercase text-sm transition active:scale-95 touch-manipulation"
                style="font-family:var(--font-display);letter-spacing:0.04em;background:var(--gradient-primary);color:var(--text-on-primary)">
                {{ 'gameplay.round.retry' | translate }}
              </button>
              <button type="button" (click)="skip.emit()" class="px-5 py-3 rounded-xl font-bold uppercase text-sm transition active:scale-95 touch-manipulation"
                style="font-family:var(--font-display);letter-spacing:0.04em;border:1.5px solid rgb(var(--rgb-accent-2) / 0.7);background:transparent;color:var(--color-accent-2)">
                {{ 'gameplay.round.skip' | translate }}
              </button>
            </div>
          </div>
        }
        @default {
          <div class="space-y-4">
            <p data-testid="round-timer" class="text-center text-2xl font-bold tabular-nums"
              style="font-family:var(--font-display);letter-spacing:-0.02em"
              [style.color]="playing() ? 'var(--color-accent-2)' : 'var(--text-muted)'">
              @if (phase() === 'loading') {
                …
              } @else if (playing()) {
                {{ position() | number: '1.1-1' }}s / {{ chosenSeconds() }}s
              } @else {
                {{ chosenSeconds() }}s / {{ chosenSeconds() }}s
              }
            </p>

            <div class="relative w-full rounded-full" style="height:6px;background:var(--bg-inactive)"
              role="progressbar" [attr.aria-valuenow]="position()" aria-valuemin="0" [attr.aria-valuemax]="maxStep()">
              <div class="absolute top-0 left-0 h-full rounded-full transition-none"
                style="background:var(--color-accent-2);box-shadow:var(--glow-accent-2)" [style.width.%]="filled()"></div>
              @if (maxStep() > 0) {
                @for (step of steps(); track step) {
                  <div class="absolute top-1/2 -translate-y-1/2 rounded-full pointer-events-none"
                    style="width:6px;height:6px;margin-left:-3px;border:1.5px solid var(--bg-page)"
                    [style.left.%]="(step / maxStep()) * 100"
                    [style.background]="step <= chosenSeconds() ? 'var(--color-accent-2)' : 'var(--text-muted)'"></div>
                }
              }
            </div>

            @if (maxStep() > chosenSeconds()) {
              <p class="text-center text-xs font-semibold" style="color:var(--text-faint)">
                {{ 'gameplay.round.stepsUpTo' | translate: { seconds: maxStep() } }}
              </p>
            }

            <div class="flex items-center justify-center gap-4 pt-1">
              <button type="button" (click)="replay.emit()" [title]="'gameplay.round.replay' | translate: { seconds: chosenSeconds() }"
                class="rounded-full transition active:scale-95 touch-manipulation flex items-center justify-center shrink-0"
                style="width:72px;height:72px;background:linear-gradient(145deg,var(--color-accent-3),var(--color-accent));box-shadow:var(--glow-primary);border:none;color:#fff">
                @if (playing()) {
                  <span class="flex gap-1" aria-hidden="true">
                    <span style="width:6px;height:19px;background:#fff;border-radius:2px"></span>
                    <span style="width:6px;height:19px;background:#fff;border-radius:2px"></span>
                  </span>
                } @else {
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <path d="M21 12a9 9 0 1 1-2.6-6.36"></path><path d="M21 3v6h-6"></path>
                  </svg>
                }
              </button>

              @if (nextStep(); as next) {
                <button type="button" (click)="listenMore.emit()" [title]="'gameplay.round.listenUpTo' | translate: { seconds: next }"
                  class="rounded-full transition active:scale-95 touch-manipulation flex items-center justify-center font-extrabold text-sm shrink-0"
                  style="font-family:var(--font-display);width:52px;height:52px;border:1.5px solid rgb(var(--rgb-accent-2) / 0.7);background:rgb(var(--rgb-accent-2) / 0.1);color:var(--color-accent-2)">
                  ▶ {{ next }}s
                </button>
              }
            </div>
          </div>
        }
      }
    </div>
  `,
})
export class RoundPlayerComponent {
  readonly phase = input.required<RoundPhase>();
  readonly chosenSeconds = input(0);
  readonly steps = input<readonly number[]>([]);
  readonly nextStep = input<number | null>(null);
  /** La position de lecture, en secondes. */
  readonly position = input(0);

  readonly replay = output<void>();
  readonly listenMore = output<void>();
  readonly retry = output<void>();
  readonly skip = output<void>();

  protected readonly playing = computed(() => this.phase() === 'playing');
  protected readonly maxStep = computed(() => this.steps().at(-1) ?? 0);
  /** La barre va de 0 au dernier palier : le remplissage montre aussi ce qu'il reste à écouter. */
  protected readonly filled = computed(() => {
    const max = this.maxStep();
    if (max <= 0) return 0;
    const phase = this.phase();
    let seconds = this.chosenSeconds();
    if (phase === 'playing') seconds = this.position();
    else if (phase === 'loading') seconds = 0;
    return Math.min(100, (seconds / max) * 100);
  });
}
