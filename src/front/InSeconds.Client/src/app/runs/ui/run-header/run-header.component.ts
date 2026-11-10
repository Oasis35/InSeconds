import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, input, output, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { pop } from '../../../ui/motion/motion';
import { RunRound, pointsToGo, runSegments } from '../../domain/run';

/**
 * L'en-tête de la partie : ✕ (abandonner, confirmé par la page), la barre du run (un segment par manche : passée en vert, en cours remplie
 * de son score avec le trait de l'objectif, à venir avec un cadenas), puis « Manche 2 » et ce qui manque pour passer. Pas de score : le total
 * est au-dessus de la pile.
 * À droite de la barre, le haut-parleur coupe ou remet les sons d'interface (son libellé dit ce que fait le toucher).
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
            @if (segment.mark !== null && showStatus()) {
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
        style="width:40px;height:44px;color:var(--text-muted)" data-testid="run-sounds"
        [attr.aria-label]="(muted() ? 'runs.header.soundsOn' : 'runs.header.soundsOff') | translate">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
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
      <h1 class="flex items-center gap-2 text-[15px] font-bold" style="font-family:var(--font-display);color:var(--text-hi)" data-testid="run-round-title">
        {{ 'runs.header.roundShort' | translate: { round: round().round } }}
        @if (theme(); as name) {
          <span class="px-2.5 py-0.5 rounded-full text-xs font-bold" style="border:1px solid var(--color-accent);color:var(--color-accent)" data-testid="run-theme-pill">{{ name }}</span>
        }
      </h1>
      <p class="text-[13px]" style="color:var(--text-light)" data-testid="run-to-go">
        @if (toGo() > 0) {
          {{ 'runs.header.toGoBefore' | translate }} <b class="font-semibold" style="color:var(--color-accent)">{{ 'runs.header.points' | translate: { points: toGo() } }}</b> {{ 'runs.header.toGoAfter' | translate }}
        } @else {
          <span #reached class="inline-flex items-center gap-1 font-semibold" style="color:var(--color-success)" data-testid="run-reached">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M5 12.5 L10 17.5 L19 7" />
            </svg>
            {{ 'runs.header.reached' | translate }}
          </span>
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
  /** Le thème de la manche, s'il y en a un : une pastille à côté du titre. */
  readonly theme = input<string | null>(null);
  /** La manche affichée : son score, son objectif, son maximum. */
  readonly round = input.required<RunRound>();
  /** Le nombre de manches de la playlist. */
  readonly rounds = input.required<number>();
  /** « Manche N » et ce qui manque pour passer, sous la barre ; les écrans de palier et de difficulté n'en montrent que la barre, sans le repère de l'objectif (il se choisit avec la difficulté). */
  readonly showStatus = input(true);
  readonly abandon = output();
  /** Les sons d'interface sont coupés. */
  readonly muted = input(false);
  /** Couper ou remettre les sons d'interface. */
  readonly toggleSounds = output();

  protected readonly segments = computed(() => runSegments(this.rounds(), this.round()));
  protected readonly toGo = computed(() => pointsToGo(this.round()));

  private readonly reached = viewChild<ElementRef<HTMLElement>>('reached');
  /** Ce qui manquait au dernier affichage : le signal « objectif atteint » ne se joue qu'au passage de « il manque des points » à « atteint ». */
  private lastToGo: number | null = null;
  /** L'objectif vient d'être franchi : le signal attend que son repère soit à l'écran. */
  private justReached = false;

  constructor() {
    effect(() => {
      const toGo = this.toGo();
      if (toGo === 0 && this.lastToGo !== null && this.lastToGo > 0) this.justReached = true;
      if (toGo > 0) this.justReached = false;
      this.lastToGo = toGo;
      const element = this.reached()?.nativeElement;
      if (this.justReached && element) {
        this.justReached = false;
        pop(element);
      }
    });
  }
}
