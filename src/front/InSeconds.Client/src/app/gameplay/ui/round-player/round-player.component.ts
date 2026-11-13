import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, ElementRef, computed, effect, input, output, signal, untracked, viewChild } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { SecondsPipe } from '../../../ui/format/seconds.pipe';
import { RoundPhase } from '../../domain/track-round';
import { SmoothPlayhead } from '../../domain/playhead';
import { WAVEFORM_BARS } from '../../domain/waveform';
import { motionReduced } from '../../../ui/motion/reduced-motion';
import { ButtonComponent } from '../../../ui/button/button.component';
import { MembraneComponent } from '../membrane/membrane.component';
import { RoundStakeComponent } from '../round-stake/round-stake.component';

/** Hauteur des barres plates : ce qui n'est pas encore joué, et tout tant que la forme de l'extrait n'est pas calculée. */
const FLAT_PEAK = 0.14;

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
 * 60 barres ; la forme reste plate tant qu'elle n'est pas jouée et apparaît au balayage, en cyan vif jusqu'à la position avec une
 * traîne presque blanche derrière la tête, en cyan sombre jusqu'au plus loin déjà écouté ; le palier débloqué en cyan sombre plat ;
 * balayage continu sur la position lissée, `SmoothPlayhead`), un repère par palier où seuls le palier en cours et le dernier sont écrits, puis sur une
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
    <!-- En ligne, le lecteur n'a pas de cadre : il est dans la carte du mode. -->
    <div [class.px-4]="!inline()" [class.py-5]="!inline()" [style.background]="inline() ? null : 'var(--bg-surface)'"
      [style.border]="inline() ? null : '1.5px solid rgb(var(--rgb-accent-2) / 0.8)'" [style.box-shadow]="inline() ? null : 'var(--tube-frame)'" [style.border-radius]="inline() ? null : 'var(--radius-card)'">
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

            @if (inline()) {
              <!-- En ligne : le bouton à gauche, la waveform à droite, posée en bas d'une colonne de la hauteur du bouton (le mode pose son
                chrono au-dessus, dans la place laissée libre). Ni repères de paliers, ni points en jeu, ni « écouter plus ». -->
              <div class="flex items-center gap-3">
                <div class="relative grid place-items-center shrink-0" style="width:64px;height:64px">
                  <span class="absolute inset-0 rounded-full pointer-events-none" style="border:2px solid rgb(var(--rgb-text) / 0.16)" aria-hidden="true"></span>
                  <ng-container *ngTemplateOutlet="replayButton; context: { size: 52, icon: 22 }" />
                </div>
                <div class="flex-1 min-w-0 flex flex-col justify-end" style="height:64px">
                  <ng-container *ngTemplateOutlet="waveform" />
                </div>
              </div>
            } @else {
              <ng-container *ngTemplateOutlet="waveform" />
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
                  <ng-container *ngTemplateOutlet="replayButton; context: { size: 72, icon: 26 }" />
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
            }
          </div>
        }
      }
    </div>

    <ng-template #waveform>
      <!-- Des couches de barres superposées, en couleurs pleines (sinon l'empilement au pied donne deux bleus) : dessous, la forme plate
        grise, puis plate cyan sombre jusqu'au palier débloqué ; la vraie forme en cyan sombre jusqu'au plus loin déjà écouté, en cyan
        vif jusqu'à la position, et sa traîne presque blanche juste derrière la tête de lecture. La forme n'apparaît qu'au balayage.
        Chaque couche est découverte de gauche à droite par deux translations opposées (la couche glisse, ses barres restent en
        place) : une barre peut être à moitié jouée, et seul transform change pendant la lecture, quel que soit le nombre de barres. -->
      <div #wave data-testid="waveform" class="relative w-full overflow-hidden" style="height:46px"
        role="progressbar" [attr.aria-valuenow]="heardTenths()" aria-valuemin="0" [attr.aria-valuemax]="maxStep()"
        [attr.aria-label]="'gameplay.round.waveform' | translate">
        <ng-container *ngTemplateOutlet="barRow; context: { color: 'var(--wave-locked)', shadow: 'var(--tube-wave-off)', heights: flatHeights }" />
        <div data-testid="waveform-unlocked" class="absolute inset-0 overflow-hidden" [class.wave-sweep]="!reduced"
          [style.transform]="layerShift(unlockedRatio(), waveWidth())">
          <div class="absolute inset-0" [class.wave-sweep]="!reduced" [style.transform]="innerShift(unlockedRatio(), waveWidth())">
            <ng-container *ngTemplateOutlet="barRow; context: { color: 'var(--wave-unlocked)', shadow: 'var(--tube-wave-lit)', heights: flatHeights }" />
          </div>
        </div>
        <div #seenLayer data-testid="waveform-seen" class="absolute inset-0 overflow-hidden" style="will-change:transform">
          <div #seenInner class="absolute inset-0" style="will-change:transform">
            <ng-container *ngTemplateOutlet="barRow; context: { color: 'var(--wave-unlocked)', shadow: 'var(--tube-wave-lit)', heights: heights() }" />
          </div>
        </div>
        <div #playedLayer data-testid="waveform-played" class="absolute inset-0 overflow-hidden" style="will-change:transform">
          <div #playedInner class="absolute inset-0" style="will-change:transform">
            <ng-container *ngTemplateOutlet="barRow; context: { color: 'var(--color-accent-2)', shadow: 'var(--tube-wave-hot)', heights: heights() }" />
          </div>
        </div>
        <!-- La traîne : une fenêtre de 15 % calée à droite sur la tête de lecture, fondue de transparent à opaque. -->
        <div #trailLayer data-testid="waveform-trail" class="absolute inset-0 pointer-events-none" style="will-change:transform">
          <div class="wave-trail absolute right-0 top-0 bottom-0 overflow-hidden" style="width:15%">
            <!-- 100 % / 0,15 : exactement la largeur de la waveform, sans arrondi (les barres restent sur celles des autres couches). -->
            <div #trailInner class="absolute right-0 top-0 bottom-0" style="width:calc(100% / 0.15);will-change:transform">
              <ng-container *ngTemplateOutlet="barRow; context: { color: 'var(--wave-trail)', shadow: 'var(--tube-wave-hot)', heights: heights() }" />
            </div>
          </div>
        </div>
      </div>
    </ng-template>
    <ng-template #barRow let-color="color" let-shadow="shadow" let-heights="heights">
      <div class="absolute inset-0 flex items-end" style="gap:2px" aria-hidden="true">
        @for (height of heights; track $index) {
          <span class="flex-1" style="min-width:1px;border-radius:2px 2px 1px 1px" [style.height.%]="height * 100" [style.background]="color" [style.box-shadow]="shadow"></span>
        }
      </div>
    </ng-template>
    <ng-template #replayButton let-size="size" let-icon="icon">
      <app-membrane [level]="bass()">
        <button type="button" (click)="replay.emit()" [disabled]="locked()" [title]="'gameplay.round.replay' | translate: { seconds: (chosenSeconds() | appSeconds) }"
          class="relative rounded-full transition active:scale-95 touch-manipulation flex items-center justify-center overflow-hidden disabled:opacity-40 disabled:grayscale disabled:active:scale-100"
          [style.width.px]="size" [style.height.px]="size" style="background:var(--fill-primary);border:1.5px solid var(--core-orange);color:var(--text-on-orange)">
          @if (submitting()) {
            <span data-testid="round-loader" class="relative animate-spin rounded-full"
              style="width:26px;height:26px;border:3px solid rgb(26 13 0 / 0.3);border-top-color:var(--text-on-orange)"></span>
          } @else if (playing()) {
            <span class="relative flex gap-1" aria-hidden="true">
              <span style="width:6px;height:19px;background:var(--text-on-orange);border-radius:2px"></span>
              <span style="width:6px;height:19px;background:var(--text-on-orange);border-radius:2px"></span>
            </span>
          } @else {
            <svg class="relative" [attr.width]="icon" [attr.height]="icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M21 12a9 9 0 1 1-2.6-6.36"></path><path d="M21 3v6h-6"></path>
            </svg>
          }
        </button>
      </app-membrane>
    </ng-template>
  `,
  styles: `
    /* Le palier débloqué s'étend en douceur (rien en mouvement réduit). */
    .wave-sweep { transition: transform 300ms ease-out; }
    /* La traîne se fond dans le cyan vif vers l'arrière. */
    .wave-trail {
      -webkit-mask-image: linear-gradient(to right, transparent, black);
      mask-image: linear-gradient(to right, transparent, black);
    }
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
  /**
   * `inline` : le bouton à gauche de la waveform, sans cadre, sans repères ni « écouter plus » (la carte d'un mode à écoute fixe) ;
   * `stacked` (défaut) : la waveform pleine largeur, ses repères, puis le bouton entre les points en jeu et « écouter plus » (Daily).
   */
  readonly layout = input<'stacked' | 'inline'>('stacked');

  readonly replay = output<void>();
  readonly listenMore = output<void>();
  readonly retry = output<void>();
  readonly skip = output<void>();

  protected readonly inline = computed(() => this.layout() === 'inline');
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

  /** Les barres plates de ce qui n'est pas encore joué. */
  protected readonly flatHeights: readonly number[] = Array.from({ length: WAVEFORM_BARS }, () => FLAT_PEAK);

  /** La vraie forme, révélée au balayage : plate tant qu'elle n'est pas calculée. */
  protected readonly heights = computed<readonly number[]>(() => this.peaks() ?? this.flatHeights);

  /** La part débloquée de la waveform, de 0 à 1, sur l'échelle du dernier palier. */
  protected readonly unlockedRatio = computed(() => ratio(this.chosenSeconds(), this.maxStep()));

  protected readonly reduced = motionReduced();

  /**
   * Une couche découverte jusqu'à `part` : elle glisse vers la droite... Au pixel près dès que la largeur est connue : une translation
   * d'une fraction de pixel poserait les barres cyan à côté des grises (liseré sur des barres de 2 à 3 px).
   */
  protected layerShift(part: number, width: number): string {
    return width > 0 ? `translateX(${Math.round(part * width) - width}px)` : `translateX(${(part - 1) * 100}%)`;
  }

  /** ...et ses barres glissent d'autant dans l'autre sens, pour rester en place. */
  protected innerShift(part: number, width: number): string {
    return width > 0 ? `translateX(${width - Math.round(part * width)}px)` : `translateX(${(1 - part) * 100}%)`;
  }

  /** La largeur de la waveform en pixels entiers (0 tant qu'elle n'est pas mesurée). */
  protected readonly waveWidth = signal(0);
  private readonly wave = viewChild<ElementRef<HTMLElement>>('wave');

  private readonly playedLayer = viewChild<ElementRef<HTMLElement>>('playedLayer');
  private readonly playedInner = viewChild<ElementRef<HTMLElement>>('playedInner');
  private readonly seenLayer = viewChild<ElementRef<HTMLElement>>('seenLayer');
  private readonly seenInner = viewChild<ElementRef<HTMLElement>>('seenInner');
  private readonly trailLayer = viewChild<ElementRef<HTMLElement>>('trailLayer');
  private readonly trailInner = viewChild<ElementRef<HTMLElement>>('trailInner');
  private readonly playhead = new SmoothPlayhead();
  /** Le plus loin déjà écouté de ce morceau : la forme révélée ne disparaît pas quand une écoute repart de 0. */
  private maxHeard = 0;

  constructor() {
    effect(onCleanup => {
      const wave = this.wave()?.nativeElement;
      if (!wave || typeof ResizeObserver !== 'function') return;
      const observer = new ResizeObserver(() => this.waveWidth.set(Math.round(wave.clientWidth)));
      observer.observe(wave);
      onCleanup(() => observer.disconnect());
    });
    // Les couches de la vraie forme sont menées hors du gabarit : pendant la lecture, une boucle d'image écrit leur translation (la
    // position lissée, sauf en mouvement réduit), sans relancer la détection de changement ; à l'arrêt, elles montrent ce qui a été
    // entendu.
    effect(onCleanup => {
      const els = [this.playedLayer(), this.playedInner(), this.seenLayer(), this.seenInner(), this.trailLayer(), this.trailInner()]
        .map(ref => ref?.nativeElement);
      if (els.some(el => !el)) return;
      const [played, playedInner, seen, seenInner, trail, trailInner] = els as HTMLElement[];
      const max = this.maxStep();
      const width = this.waveWidth();
      const shift = (outer: HTMLElement, inner: HTMLElement, seconds: number) => {
        const part = ratio(seconds, max);
        outer.style.transform = this.layerShift(part, width);
        inner.style.transform = this.innerShift(part, width);
      };
      const paint = (seconds: number) => {
        this.maxHeard = Math.max(this.maxHeard, seconds);
        shift(played, playedInner, seconds);
        shift(trail, trailInner, seconds);
        shift(seen, seenInner, this.maxHeard);
      };
      if (!this.playing()) {
        // Un extrait qui (re)charge repart d'une forme plate : rien n'est encore écouté de ce morceau.
        if (this.phase() === 'loading') this.maxHeard = 0;
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
        // En mouvement réduit, ni lissage ni avance image par image : les couches avancent au dixième, comme le chrono.
        paint(this.reduced ? Math.round(Math.min(position, limit) * 10) / 10 : this.playhead.next(position, limit, performance.now()));
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
