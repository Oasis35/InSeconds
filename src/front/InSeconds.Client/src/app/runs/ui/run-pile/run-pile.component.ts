import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, effect, inject, input, untracked } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { enterRow, settleLine } from '../../../ui/motion/motion';
import { PileEntry } from '../../domain/run';
import { SecondsPipe } from '../../../ui/format/seconds.pipe';
import { RunWaveComponent } from '../run-wave/run-wave.component';
import { PointsPipe } from '../../../ui/format/points.pipe';

/** La ligne d'une manche passée se pose après l'entrée du morceau qui la finit, en secondes. */
const LINE_DELAY = 0.45;

/** La clé d'une ligne de la pile : un morceau par sa position, une manche passée par son numéro. */
const keyOf = (entry: PileEntry): string => (entry.kind === 'track' ? `t${entry.track.position}` : `r${entry.passed.round}`);

/**
 * La pile de tous les morceaux joués, le plus récent en haut : pochette, forme de l'extrait, « Artiste - Titre », points.
 * Quand une manche est terminée, sa ligne se pose au-dessus de ses morceaux (« Manche N », deux filets, son score et son écoute), et ses morceaux ne gardent que pochette, forme et points, grisés. Toucher une ligne ne rejoue rien.
 */
@Component({
  selector: 'app-run-pile',
  imports: [PointsPipe, SecondsPipe, TranslatePipe, RunWaveComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <div class="mt-3" data-testid="run-pile">
      @for (entry of entries(); track key(entry)) {
        @if (entry.kind === 'palier') {
          @let color = 'var(--color-accent-2)';
          <div [attr.data-key]="key(entry)" class="relative flex items-center gap-3 py-3 mt-3 mb-1.5" data-testid="run-palier">
            <i data-motion="rule" class="absolute left-0 right-0 top-0 h-px" [style.background]="color" aria-hidden="true"></i>
            <i data-motion="rule" class="absolute left-0 right-0 bottom-0 h-px" [style.background]="color" aria-hidden="true"></i>
            <span data-motion="name" class="text-xl font-black" style="font-family:var(--font-score);color:var(--text-hi)">{{ 'runs.pile.round' | translate: { round: entry.passed.round } }}</span>
            <span data-motion="meta" class="ml-auto text-right text-xs leading-snug tabular-nums" style="font-family:var(--font-clock);color:var(--text-muted)">
              {{ entry.passed.score | appPoints }}<br />{{ entry.passed.listenSeconds | appSeconds }}
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
  protected readonly key = keyOf;

  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly injector = inject(Injector);

  constructor() {
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
}
