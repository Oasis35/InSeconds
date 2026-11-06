import {
  ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, input, signal, untracked, viewChild,
} from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { motionReduced } from '../../../ui/motion/reduced-motion';
import { tweenNumber, enterRow, settleLine } from '../../../ui/motion/motion';
import { PileEntry, RunGhostGap } from '../../domain/run';
import { RunDiscComponent, discColor } from '../run-disc/run-disc.component';
import { RunWaveComponent } from '../run-wave/run-wave.component';

/** Le temps que les points de la réponse rejoignent le total avant qu'il compte, en secondes. */
const COUNT_DELAY = 0.9;

/** L'écart avec le fantôme change quand le total a fini de compter (le délai, puis le décompte de `tweenNumber`). */
const GHOST_DELAY_MS = (COUNT_DELAY + 0.45) * 1000;

/** La ligne d'une manche passée se pose après l'entrée du morceau qui la finit, en secondes. */
const LINE_DELAY = 0.45;

/** La clé d'une ligne de la pile : un morceau par sa position, une manche passée par son numéro. */
const keyOf = (entry: PileEntry): string => (entry.kind === 'track' ? `t${entry.track.position}` : `r${entry.passed.round}`);

/**
 * Le total du run puis la pile de tous les morceaux joués, le plus récent en haut : pochette, forme de l'extrait, « Artiste - Titre », points.
 * Quand une manche est passée, sa ligne se pose au-dessus de ses morceaux (le disque, son nom en blanc, deux filets de sa couleur, la manche
 * et son score sur son objectif), et ses morceaux ne gardent que pochette, forme et points, grisés. Toucher une ligne ne rejoue rien.
 */
@Component({
  selector: 'app-run-pile',
  imports: [TranslatePipe, RunDiscComponent, RunWaveComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="flex items-baseline justify-between mt-4 px-0.5 pb-2" style="border-bottom:1px solid var(--border-medium)">
      <span class="text-[13px]" style="color:var(--text-muted)">{{ 'runs.pile.total' | translate }}</span>
      <b #total class="inline-block tabular-nums text-[26px] font-black leading-none origin-right" style="font-family:var(--font-score);color:var(--text-hi)"
        data-testid="run-total-score"></b>
    </div>
    @if (shownGhost(); as ghost) {
      <!-- Le fantôme de l'ami : son total au même morceau, en violet (les autres joueurs), et l'écart du joueur. -->
      <p class="flex items-baseline justify-between gap-3 px-0.5 pt-1.5 text-[13px]" data-testid="run-ghost">
        <!-- Le pseudo se coupe sur un petit téléphone, jamais le total ni l'écart. -->
        <span class="flex min-w-0 items-baseline gap-1" style="color:var(--color-violet)">
          <span class="truncate">{{ ghost.pseudo ?? ('runs.link.guest' | translate) }}</span>&ngsp;
          <b class="shrink-0 tabular-nums" style="font-family:var(--font-score)">{{ format(ghost.total) }}</b>&ngsp;
          @if (ghost.stoppedAtRound !== null) {
            <span class="shrink-0 whitespace-nowrap" data-testid="run-ghost-stopped">{{ 'runs.ghost.stopped' | translate: { round: ghost.stoppedAtRound } }}</span>
          }
        </span>
        <span class="shrink-0 whitespace-nowrap font-semibold tabular-nums" style="color:var(--text-hi)" data-testid="run-ghost-gap">
          @if (ghost.gap > 0) {
            {{ 'runs.ghost.ahead' | translate: { points: format(ghost.gap) } }}
          } @else if (ghost.gap < 0) {
            {{ 'runs.ghost.behind' | translate: { points: format(-ghost.gap) } }}
          } @else {
            {{ 'runs.ghost.tied' | translate }}
          }
        </span>
      </p>
    }

    <div data-testid="run-pile">
      @for (entry of entries(); track key(entry)) {
        @if (entry.kind === 'palier') {
          @let color = lineColor(entry.passed.disc.key);
          <div [attr.data-key]="key(entry)" class="relative flex items-center gap-3 py-3 mt-3 mb-1.5" data-testid="run-palier">
            <i data-motion="rule" class="absolute left-0 right-0 top-0 h-px" [style.background]="color" aria-hidden="true"></i>
            <i data-motion="rule" class="absolute left-0 right-0 bottom-0 h-px" [style.background]="color" aria-hidden="true"></i>
            <app-run-disc data-motion="disc" class="block shrink-0" [disc]="entry.passed.disc.key" [size]="34" [shine]="false" />
            <span data-motion="name" class="text-xl font-black" style="font-family:var(--font-score);color:var(--text-hi)">{{ entry.passed.disc.key | translate }}</span>
            <span data-motion="meta" class="ml-auto text-right text-xs leading-snug tabular-nums" style="font-family:var(--font-clock);color:var(--text-muted)">
              {{ 'runs.pile.round' | translate: { round: entry.passed.round } }}<br />{{ entry.passed.score }} / {{ entry.passed.objective }}
            </span>
          </div>
        } @else {
          @let track = entry.track;
          <div [attr.data-key]="key(entry)" class="flex items-center gap-3 py-2 px-0.5 overflow-hidden" style="border-bottom:1px solid var(--text-sep)"
            data-testid="run-pile-track" [attr.data-past]="entry.past ? '' : null">
            @if (track.neutralized) {
              <span class="grid place-items-center rounded-full shrink-0" style="width:40px;height:40px;background:var(--bg-inactive);color:var(--text-faint)" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M11 5 6 9H2v6h4l5 4V5z" /><line x1="23" y1="9" x2="17" y2="15" /><line x1="17" y1="9" x2="23" y2="15" />
                </svg>
              </span>
            } @else if (track.coverUrl) {
              <img [src]="track.coverUrl" alt="" class="rounded-full object-cover shrink-0" style="width:40px;height:40px" loading="lazy" />
            } @else {
              <span class="rounded-full shrink-0" style="width:40px;height:40px;background:var(--bg-inactive)" aria-hidden="true"></span>
            }
            <div class="flex-1 min-w-0">
              <app-run-wave [peaks]="shapes()[track.position] ?? null" [height]="22" [gap]="1.5" />
              <p class="pile-title text-[13px] truncate" [class.gone]="entry.past">
                @if (track.neutralized) {
                  <span style="color:var(--text-muted)">{{ 'runs.pile.withdrawn' | translate }}</span>
                } @else {
                  {{ track.artist }} <span style="color:var(--text-muted)">- {{ track.title }}</span>
                }
              </p>
            </div>
            <span class="pile-points shrink-0 text-right tabular-nums text-sm font-semibold" style="width:46px;font-family:var(--font-clock)"
              [style.color]="entry.past || track.points === 0 ? 'var(--text-faint)' : 'var(--text-hi)'">
              {{ track.points > 0 ? '+' + track.points : '0' }}
            </span>
          </div>
        }
      }
    </div>
  `,
  styles: `
    .pile-title { margin-top: 5px; max-height: 20px; transition: opacity 350ms 1.1s, max-height 450ms 1.1s, margin 450ms 1.1s; }
    .pile-title.gone { opacity: 0; max-height: 0; margin-top: 0; }
    .pile-points { transition: color 450ms 1.1s; }
    @media (prefers-reduced-motion: reduce) { .pile-title, .pile-points { transition: none; } }
  `,
})
export class RunPileComponent {
  readonly entries = input.required<readonly PileEntry[]>();
  /** La forme de chaque morceau, par position. */
  readonly shapes = input<Readonly<Record<number, readonly number[]>>>({});
  /** Le total du run. */
  readonly total = input.required<number>();
  /** L'écart avec le fantôme d'un ami sur la même playlist ; vide sans fantôme. */
  readonly ghost = input<RunGhostGap | null>(null);
  readonly lang = input<'fr' | 'en'>('fr');
  /**
   * Le fantôme affiché : il change en même temps que le total a fini de compter (les points s'envolent d'abord), sinon l'écart annoncerait le
   * verdict avant l'animation et contredirait un instant le total affiché. Tout de suite au premier affichage et en mouvement réduit.
   */
  protected readonly shownGhost = signal<RunGhostGap | null>(null);
  private readonly numbers = computed(() => new Intl.NumberFormat(this.lang()));

  /** Le total, que les points d'une réponse rejoignent. */
  readonly totalAnchor = viewChild.required<ElementRef<HTMLElement>>('total');

  protected readonly key = keyOf;
  protected readonly lineColor = discColor;

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);

  constructor() {
    let ghostTimer: ReturnType<typeof setTimeout> | null = null;
    inject(DestroyRef).onDestroy(() => { if (ghostTimer !== null) clearTimeout(ghostTimer); });
    effect(() => {
      const ghost = this.ghost();
      untracked(() => {
        if (ghostTimer !== null) clearTimeout(ghostTimer);
        ghostTimer = null;
        if (this.shownGhost() === null || ghost === null || motionReduced()) {
          this.shownGhost.set(ghost);
          return;
        }
        ghostTimer = setTimeout(() => { ghostTimer = null; this.shownGhost.set(ghost); }, GHOST_DELAY_MS);
      });
    });
    // Le total compte jusqu'à sa nouvelle valeur, le temps que les points le rejoignent ; posé tel quel au premier affichage.
    let shownTotal: number | null = null;
    effect(() => {
      const total = this.total();
      const element = this.totalAnchor().nativeElement;
      untracked(() => {
        if (shownTotal === null || total < shownTotal) element.textContent = String(total);
        else tweenNumber(element, shownTotal, total, COUNT_DELAY);
        shownTotal = total;
      });
    });
    // Les lignes qui arrivent s'ouvrent ; une manche passée pose sa ligne. Rien ne s'anime au premier affichage (reprise).
    let known: Set<string> | null = null;
    effect(() => {
      const keys = this.entries().map(keyOf);
      untracked(() => {
        const previous = known;
        known = new Set(keys);
        if (previous === null) return;
        const added = keys.filter(key => !previous.has(key));
        if (added.length === 0) return;
        afterNextRender(() => {
          const root = this.host.nativeElement as HTMLElement;
          const lineDelay = added.some(key => key.startsWith('t')) ? LINE_DELAY : 0;
          for (const key of added) {
            const element = root.querySelector<HTMLElement>(`[data-key="${key}"]`);
            if (!element) continue;
            if (key.startsWith('r')) settleLine(element, lineDelay);
            else enterRow(element);
          }
        }, { injector: this.injector });
      });
    });
  }

  /** « 1 240 » : les grands nombres au format de la langue. */
  protected format(value: number): string {
    return this.numbers().format(value);
  }
}
