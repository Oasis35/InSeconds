import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { RunRound, pointsToGo, runSegments } from '../../domain/run';

/**
 * L'en-tête de la partie : ✕ (abandonner, confirmé par la page), la barre du run (un segment par manche : passée en vert, en cours remplie
 * de son score avec le trait de l'objectif, à venir avec un cadenas), puis « Manche 2 » et ce qui manque pour passer. Pas de score : le total
 * est au-dessus de la pile.
 */
@Component({
  selector: 'app-run-header',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center gap-2.5" style="height:44px">
      <button type="button" (click)="abandon.emit()" class="grid place-items-center touch-manipulation shrink-0 -ml-2"
        style="width:40px;height:44px;color:var(--text-muted)" [attr.aria-label]="'runs.header.abandon' | translate" data-testid="run-abandon">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true">
          <path d="M5 5 L19 19 M19 5 L5 19" />
        </svg>
      </button>
      <div class="flex-1 grid gap-1" [style.grid-template-columns]="'repeat(' + segments().length + ', 1fr)'" data-testid="run-bar"
        role="img" [attr.aria-label]="'runs.header.round' | translate: { round: round().round, rounds: rounds() }">
        @for (segment of segments(); track $index) {
          <div class="relative rounded-[4px]" style="height:12px;background:var(--bg-inactive)" [attr.data-state]="segment.state"
            [style.box-shadow]="segment.state === 'current' ? '0 0 0 1.5px var(--color-accent)' : null">
            <div class="h-full rounded-[4px] bar-fill" [style.width.%]="segment.fill * 100"
              [style.background]="segment.state === 'done' ? 'var(--color-success)' : 'var(--gradient-primary)'"></div>
            @if (segment.mark !== null) {
              <div class="absolute" style="top:-3px;width:2px;height:18px;background:var(--text-hi)" [style.left.%]="segment.mark * 100"></div>
            }
            @if (segment.state === 'locked') {
              <svg class="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2" width="9" height="10" viewBox="0 0 10 12" aria-hidden="true">
                <rect x="1" y="5" width="8" height="6" rx="1" fill="var(--text-faint)" />
                <path d="M3 5 V3.5 a2 2 0 0 1 4 0 V5" stroke="var(--text-faint)" stroke-width="1.4" fill="none" />
              </svg>
            }
          </div>
        }
      </div>
      <button type="button" (click)="toggleSounds.emit()" class="grid place-items-center touch-manipulation shrink-0 -mr-2"
        style="width:40px;height:44px;color:var(--text-muted)" [attr.aria-pressed]="muted()" data-testid="run-sounds"
        [attr.aria-label]="(muted() ? 'runs.header.soundsOn' : 'runs.header.soundsOff') | translate">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M4 9 H8 L13 5 V19 L8 15 H4 Z" />
          @if (muted()) {
            <path d="M17 9 L22 15 M22 9 L17 15" />
          } @else {
            <path d="M17 9 a4 4 0 0 1 0 6 M19.5 6.5 a7.5 7.5 0 0 1 0 11" />
          }
        </svg>
      </button>
    </div>
    @if (showStatus()) {
    <div class="flex justify-between items-baseline mt-2.5" style="min-height:22px">
      <h1 class="text-[15px] font-bold" style="font-family:var(--font-display);color:var(--text-hi)" data-testid="run-round-title">
        {{ 'runs.header.roundShort' | translate: { round: round().round } }}
      </h1>
      <p class="text-[13px]" style="color:var(--text-light)" data-testid="run-to-go">
        @if (toGo() > 0) {
          {{ 'runs.header.toGoBefore' | translate }} <b class="font-semibold" style="color:var(--color-accent)">{{ 'runs.header.points' | translate: { points: toGo() } }}</b> {{ 'runs.header.toGoAfter' | translate }}
        } @else {
          <span style="color:var(--color-success)">{{ 'runs.header.reached' | translate }}</span>
        }
      </p>
    </div>
    }
  `,
  styles: `
    .bar-fill { transition: width 700ms cubic-bezier(0.2, 0.8, 0.2, 1), background-color 500ms; }
    @media (prefers-reduced-motion: reduce) { .bar-fill { transition: none; } }
  `,
})
export class RunHeaderComponent {
  /** La manche affichée : son score, son objectif, son maximum. */
  readonly round = input.required<RunRound>();
  /** Le nombre de manches de la playlist. */
  readonly rounds = input.required<number>();
  /** « Manche N » et ce qui manque pour passer, sous la barre ; l'écran de palier n'en montre que la barre. */
  readonly showStatus = input(true);
  readonly abandon = output();
  /** Les sons d'interface sont coupés. */
  readonly muted = input(false);
  /** Couper ou remettre les sons d'interface. */
  readonly toggleSounds = output();

  protected readonly segments = computed(() => runSegments(this.rounds(), this.round()));
  protected readonly toGo = computed(() => pointsToGo(this.round()));
}
