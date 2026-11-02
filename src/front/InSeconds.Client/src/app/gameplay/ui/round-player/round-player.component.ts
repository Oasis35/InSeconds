import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, input, output, untracked, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { SecondsPipe } from '../../../ui/format/seconds.pipe';
import { RoundPhase } from '../../domain/track-round';
import { SmoothPlayhead } from '../../domain/playhead';
import { WAVEFORM_BARS } from '../../domain/waveform';
import { motionReduced } from '../../../ui/motion/reduced-motion';
import { ButtonComponent } from '../../../ui/button/button.component';
import { MembraneComponent } from '../membrane/membrane.component';
import { RoundStakeComponent } from '../round-stake/round-stake.component';

/** Hauteur d'une barre tant que la forme de l'extrait n'est pas calculée (ou si son calcul a échoué). */
const FLAT_PEAK = 0.18;

/** Les couleurs des trois couches de barres : jouée (cyan), débloquée mais pas encore jouée (cyan pâle), encore verrouillée (gris). */
const PLAYED = 'var(--color-accent-2)';
const UNLOCKED = 'rgb(var(--rgb-accent-2) / 0.32)';
const LOCKED = 'rgb(var(--rgb-text) / 0.14)';

interface StepMark {
  readonly seconds: number;
  readonly left: number;
  readonly unlocked: boolean;
  readonly current: boolean;
  /** Seuls le palier en cours et le dernier palier sont écrits. */
  readonly labelled: boolean;
  readonly align: 'start' | 'center' | 'end';
}

/**
 * Le lecteur de la manche : la waveform de l'extrait sur toute la largeur (échelle proportionnelle au temps, de 0 au dernier palier,
 * 60 barres ; jouée en cyan, débloquée en cyan pâle, remplie par un balayage continu sur la position lissée, `SmoothPlayhead`), un repère par palier où seuls le palier en cours et le dernier sont écrits, puis sur une
 * ligne les points en jeu (si le mode en a), le bouton ↺ qui danse avec les basses (`app-membrane`) et le rond « ▶ X s » pour écouter
 * plus. Remplace aussi la zone quand l'extrait manque ou que la lecture échoue : jamais de boucle silencieuse (piège 33), le joueur
 * choisit « Réessayer » ou « Passer ».
 *
 * Le temps écouté (« 0,4 s / 1 s ») n'est plus affiché : il reste lisible par un lecteur d'écran (`round-timer`, et la valeur de la
 * waveform), et les tests de bout en bout le suivent.
 */
@Component({
  selector: 'app-round-player',
  imports: [NgTemplateOutlet, SecondsPipe, TranslatePipe, ButtonComponent, MembraneComponent, RoundStakeComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="px-4 py-5" style="background:var(--bg-surface);border:1px solid var(--border-medium);border-radius:var(--radius-card)">
      @switch (phase()) {
        @case ('no-preview') {
          <div class="space-y-5">
            <p class="text-center text-sm" style="color:var(--text-muted)">{{ 'gameplay.round.noPreview' | translate }}</p>
            <div class="flex justify-center">
              <button appButton type="button" variant="neutral" (click)="skip.emit()">
                {{ 'gameplay.round.skip' | translate }}
              </button>
            </div>
          </div>
        }
        @case ('audio-error') {
          <div class="space-y-4 text-center">
            <p role="alert" class="text-sm" style="color:var(--text-error)">{{ 'gameplay.round.playbackError' | translate }}</p>
            <!-- L'un sous l'autre, comme « Valider » et « Passer » : côte à côte, « Passer (0 pts) » passe sur deux lignes à 375 px. -->
            <div class="flex flex-col gap-3">
              <button appButton type="button" [block]="true" (click)="retry.emit()">
                {{ 'gameplay.round.retry' | translate }}
              </button>
              <button appButton type="button" variant="neutral" [block]="true" (click)="skip.emit()">
                {{ 'gameplay.round.skip' | translate }}
              </button>
            </div>
          </div>
        }
        @default {
          <div class="flex flex-col gap-1">
            <p data-testid="round-timer" class="sr-only">
              @if (phase() === 'loading') {
                …
              } @else if (playing()) {
                {{ heardTenths() | appSeconds: 1 }} / {{ chosenSeconds() | appSeconds }}
              } @else {
                {{ chosenSeconds() | appSeconds }} / {{ chosenSeconds() | appSeconds }}
              }
            </p>

            <!-- Trois couches de barres identiques : grises dessous, cyan pâle jusqu'au palier débloqué, cyan vif jusqu'à la position. Les
              deux du dessus sont découvertes de gauche à droite par deux translations opposées (la couche glisse, ses barres restent en
              place) : une barre peut être à moitié jouée, et seul transform change pendant la lecture, quel que soit le nombre de barres. -->
            <div data-testid="waveform" class="relative w-full overflow-hidden" style="height:46px"
              role="progressbar" [attr.aria-valuenow]="heardTenths()" aria-valuemin="0" [attr.aria-valuemax]="maxStep()"
              [attr.aria-label]="'gameplay.round.waveform' | translate">
              <ng-container *ngTemplateOutlet="barRow; context: { color: colors.locked }" />
              <div #unlockedLayer data-testid="waveform-unlocked" class="absolute inset-0 overflow-hidden" [class.wave-sweep]="!reduced"
                [style.transform]="layerShift(unlockedRatio())">
                <div class="absolute inset-0" [class.wave-sweep]="!reduced" [style.transform]="innerShift(unlockedRatio())">
                  <ng-container *ngTemplateOutlet="barRow; context: { color: colors.unlocked }" />
                </div>
              </div>
              <div #playedLayer data-testid="waveform-played" class="absolute inset-0 overflow-hidden" style="will-change:transform">
                <div #playedInner class="absolute inset-0" style="will-change:transform">
                  <ng-container *ngTemplateOutlet="barRow; context: { color: colors.played }" />
                </div>
              </div>
            </div>
            <ng-template #barRow let-color="color">
              <div class="absolute inset-0 flex items-end" style="gap:2px" aria-hidden="true">
                @for (height of heights(); track $index) {
                  <span class="flex-1" style="min-width:1px;border-radius:2px 2px 1px 1px" [style.height.%]="height * 100" [style.background]="color"></span>
                }
              </div>
            </ng-template>

            <div class="relative w-full tabular-nums" style="height:24px;font-family:var(--font-clock);font-size:11px;font-weight:600" aria-hidden="true">
              @for (mark of marks(); track mark.seconds) {
                <span class="absolute top-0 flex flex-col gap-0.5 whitespace-nowrap" data-testid="step-mark"
                  [style.left.%]="mark.left"
                  [class.items-center]="mark.align === 'center'" [class.items-end]="mark.align === 'end'"
                  [style.transform]="shiftOf(mark)"
                  [style.color]="mark.current ? 'var(--color-accent-2)' : 'var(--text-muted)'">
                  <i class="block" style="width:1.5px" [style.height.px]="mark.current ? 7 : 5"
                    [style.background]="mark.unlocked ? 'var(--color-accent-2)' : 'rgb(var(--rgb-text) / 0.25)'"></i>
                  @if (mark.labelled) {
                    {{ mark.seconds | appSeconds }}
                  }
                </span>
              }
            </div>

            <div class="grid items-center pt-1" style="grid-template-columns:1fr auto 1fr">
              <div class="flex justify-center">
                @let points = stake();
                @if (points !== null) {
                  <app-round-stake [value]="points" />
                }
              </div>

              <div class="relative grid place-items-center" style="width:96px;height:96px">
                <span class="absolute rounded-full pointer-events-none" style="inset:4px;border:2px solid rgb(var(--rgb-text) / 0.18)" aria-hidden="true"></span>
                <app-membrane [level]="bass()">
                  <button type="button" (click)="replay.emit()" [disabled]="locked()" [title]="'gameplay.round.replay' | translate: { seconds: (chosenSeconds() | appSeconds) }"
                    class="relative rounded-full transition active:scale-95 touch-manipulation flex items-center justify-center overflow-hidden disabled:opacity-40 disabled:grayscale disabled:active:scale-100"
                    style="width:72px;height:72px;background:linear-gradient(145deg,var(--color-accent-3),var(--color-accent));border:none;color:var(--text-on-primary)">
                    <span class="absolute rounded-full pointer-events-none" style="inset:10px;background:radial-gradient(circle, rgb(var(--rgb-text) / 0.16), transparent 70%)" aria-hidden="true"></span>
                    @if (submitting()) {
                      <span data-testid="round-loader" class="relative animate-spin rounded-full"
                        style="width:26px;height:26px;border:3px solid rgb(var(--rgb-text) / 0.35);border-top-color:var(--text-on-primary)"></span>
                    } @else if (playing()) {
                      <span class="relative flex gap-1" aria-hidden="true">
                        <span style="width:6px;height:19px;background:var(--text-on-primary);border-radius:2px"></span>
                        <span style="width:6px;height:19px;background:var(--text-on-primary);border-radius:2px"></span>
                      </span>
                    } @else {
                      <svg class="relative" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                        <path d="M21 12a9 9 0 1 1-2.6-6.36"></path><path d="M21 3v6h-6"></path>
                      </svg>
                    }
                  </button>
                </app-membrane>
              </div>

              <div class="flex justify-center">
                @if (nextStep(); as next) {
                  <button type="button" (click)="listenMore.emit()" [disabled]="locked()" [title]="'gameplay.round.listenUpTo' | translate: { seconds: (next | appSeconds) }"
                    class="rounded-full transition active:scale-95 touch-manipulation flex items-center justify-center whitespace-nowrap text-[13px] font-bold disabled:opacity-40 disabled:grayscale"
                    style="font-family:var(--font-display);width:60px;height:60px;border:1.5px solid rgb(var(--rgb-accent-2) / 0.7);background:rgb(var(--rgb-accent-2) / 0.1);color:var(--color-accent-2)">
                    ▶ {{ next | appSeconds }}
                  </button>
                }
              </div>
            </div>
          </div>
        }
      }
    </div>
  `,
  styles: `
    /* Le cyan pâle s'étend en douceur quand un palier se débloque (rien en mouvement réduit). */
    .wave-sweep { transition: transform 300ms ease-out; }
  `,
})
export class RoundPlayerComponent {
  readonly phase = input.required<RoundPhase>();
  readonly chosenSeconds = input(0);
  readonly steps = input<readonly number[]>([]);
  readonly nextStep = input<number | null>(null);
  /** La position de lecture, en secondes. */
  readonly position = input(0);
  /** La forme de l'extrait, une valeur de 0 à 1 par barre ; `null` tant qu'elle n'est pas calculée (barres plates). */
  readonly peaks = input<readonly number[] | null>(null);
  /** L'énergie des basses à l'instant, de 0 à 1 : le bouton danse avec. */
  readonly bass = input(0);
  /** Les points en jeu ; `null` si le mode n'en a pas (rien à gauche du bouton). */
  readonly stake = input<number | null>(null);

  readonly replay = output<void>();
  readonly listenMore = output<void>();
  readonly retry = output<void>();
  readonly skip = output<void>();

  protected readonly playing = computed(() => this.phase() === 'playing');
  /** La réponse part (ou son envoi a échoué) : on ne réécoute plus, on attend. */
  protected readonly locked = computed(() => this.phase() === 'submitting' || this.phase() === 'submit-error');
  protected readonly submitting = computed(() => this.phase() === 'submitting');
  protected readonly maxStep = computed(() => this.steps().at(-1) ?? 0);

  /** Jusqu'où l'extrait est joué : la position en lecture, le palier entier une fois joué, rien pendant le chargement. */
  private readonly heard = computed(() => {
    const phase = this.phase();
    if (phase === 'playing') return this.position();
    if (phase === 'loading') return 0;
    return this.chosenSeconds();
  });

  /** Le temps écouté au dixième (ce que montre le chrono lu par les lecteurs d'écran) : le gabarit ne change que dix fois par seconde. */
  protected readonly heardTenths = computed(() => Math.round(this.heard() * 10) / 10);

  /** La hauteur de chaque barre : la forme de l'extrait, plate tant qu'elle n'est pas calculée. */
  protected readonly heights = computed<readonly number[]>(() => this.peaks() ?? Array.from({ length: WAVEFORM_BARS }, () => FLAT_PEAK));

  /** La part débloquée de la waveform, de 0 à 1, sur l'échelle du dernier palier. */
  protected readonly unlockedRatio = computed(() => ratio(this.chosenSeconds(), this.maxStep()));

  protected readonly colors = { played: PLAYED, unlocked: UNLOCKED, locked: LOCKED } as const;
  protected readonly reduced = motionReduced();

  /** Une couche découverte jusqu'à `part` : elle glisse vers la droite... */
  protected layerShift(part: number): string {
    return `translateX(${(part - 1) * 100}%)`;
  }

  /** ...et ses barres glissent d'autant dans l'autre sens, pour rester en place. */
  protected innerShift(part: number): string {
    return `translateX(${(1 - part) * 100}%)`;
  }

  private readonly playedLayer = viewChild<ElementRef<HTMLElement>>('playedLayer');
  private readonly playedInner = viewChild<ElementRef<HTMLElement>>('playedInner');
  private readonly playhead = new SmoothPlayhead();

  constructor() {
    // La couche cyan vif est menée hors du gabarit : pendant la lecture, une boucle d'image écrit sa translation (la position lissée,
    // sauf en mouvement réduit), sans relancer la détection de changement ; à l'arrêt, elle montre ce qui a été entendu.
    effect(onCleanup => {
      const layer = this.playedLayer()?.nativeElement;
      const inner = this.playedInner()?.nativeElement;
      if (!layer || !inner) return;
      const max = this.maxStep();
      const paint = (seconds: number) => {
        const part = ratio(seconds, max);
        layer.style.transform = this.layerShift(part);
        inner.style.transform = this.innerShift(part);
      };
      if (!this.playing()) {
        const heard = this.heard();
        untracked(() => this.playhead.reset(heard, performance.now()));
        paint(heard);
        return;
      }
      untracked(() => this.playhead.reset(this.position(), performance.now()));
      let frame = 0;
      const tick = () => {
        const position = this.position();
        const limit = Math.max(this.chosenSeconds(), position);
        paint(this.reduced ? Math.min(position, limit) : this.playhead.next(position, limit, performance.now()));
        frame = requestAnimationFrame(tick);
      };
      untracked(tick);
      onCleanup(() => cancelAnimationFrame(frame));
    });
  }

  /** Le repère d'un palier est centré sur lui, sauf au bord : le dernier se cale à droite, un tout premier à gauche. */
  protected shiftOf(mark: StepMark): string | null {
    if (mark.align === 'center') return 'translateX(-50%)';
    return mark.align === 'end' ? 'translateX(-100%)' : null;
  }

  protected readonly marks = computed<readonly StepMark[]>(() => {
    const max = this.maxStep();
    if (max <= 0) return [];
    const chosen = this.chosenSeconds();
    return this.steps().map(seconds => {
      const left = (seconds / max) * 100;
      let align: StepMark['align'] = 'center';
      if (seconds === max) align = 'end';
      else if (left < 8) align = 'start';
      return { seconds, left, unlocked: seconds <= chosen, current: seconds === chosen, labelled: seconds === chosen || seconds === max, align };
    });
  });
}

/** `seconds` rapporté au dernier palier, borné à [0, 1]. */
function ratio(seconds: number, max: number): number {
  return max > 0 ? Math.min(1, Math.max(0, seconds / max)) : 0;
}
