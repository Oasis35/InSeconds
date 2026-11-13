import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { RunLevel, levelDeltaText } from '../../domain/run';
import { RunDiscComponent } from '../run-disc/run-disc.component';

/**
 * Le niveau du joueur : son disque et son nom, ses points de niveau, ce que la dernière partie a changé (« +38 » en orange, une baisse en gris), la
 * jauge vers le disque suivant et ce qui manque pour l'avoir (« Disque d'or dans 220 pts »), « provisoire » tant qu'il a fini trop peu de parties.
 * Sur la fin d'un run, les morceaux trouvés et « Revoir », qui ouvre la partie dans l'historique.
 */
@Component({
  selector: 'app-run-level-card',
  imports: [TranslatePipe, RouterLink, RunDiscComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    <section class="rounded-(--radius-card) px-4 py-3 flex flex-col gap-2" data-testid="run-level" [attr.data-disc]="level().disc.key"
      style="background:var(--bg-surface);border:1px solid var(--border-subtle)"
      [attr.aria-label]="'runs.level.label' | translate: { disc: (level().disc.key | translate), points: format(level().points) }">
      <div class="flex items-center gap-2.5">
        <app-run-disc class="shrink-0" [disc]="level().disc.key" [size]="28" [shine]="false" />
        <p class="min-w-0 flex-1 text-base font-bold leading-tight" style="font-family:var(--font-display);color:var(--text-hi)">
          {{ level().disc.key | translate }}
          @if (level().provisional) {
            <span class="text-xs font-normal" style="font-family:var(--font-body);color:var(--text-muted)" data-testid="run-level-provisional">· {{ 'runs.level.provisional' | translate }}</span>
          }
        </p>
        <p class="shrink-0 text-base font-bold tabular-nums" style="font-family:var(--font-score);color:var(--text-hi)" data-testid="run-level-points">
          {{ format(level().points) }}
          @if (delta(); as delta) {
            <span class="text-sm" data-testid="run-level-delta" [style.color]="rising() ? 'var(--color-accent-3)' : 'var(--text-muted)'">{{ delta }}</span>
          }
        </p>
      </div>
      <div class="flex items-center gap-3">
        <div class="flex-1 h-1.5 rounded-full overflow-hidden" style="background:var(--bg-inactive)" aria-hidden="true">
          <div class="h-full rounded-full" data-testid="run-level-bar" style="background:var(--color-accent-3)" [style.width.%]="level().progressPercent"></div>
        </div>
        @if (found() !== null && level().nextDisc; as next) {
          <span class="shrink-0 text-sm" style="color:var(--text-muted)" data-testid="run-level-next-disc">{{ next.key | translate }}</span>
        }
      </div>
      @if (found(); as found) {
        <!-- Sur la fin d'un run (maquette 4) : les morceaux trouvés et « Revoir », le disque suivant au bout de la jauge. -->
        <p class="flex items-center gap-2 text-sm" style="color:var(--text-light)">
          <span data-testid="run-found">{{ found }}</span>
          @if (reviewLink(); as link) {
            <span aria-hidden="true">·</span>
            <a [routerLink]="link" class="underline underline-offset-4 touch-manipulation" style="color:var(--text-hi)" data-testid="run-level-review">{{ 'runs.level.review' | translate }} ›</a>
          }
        </p>
      } @else {
      <div class="flex items-center justify-between gap-3 text-sm" style="color:var(--text-light)">
        <p data-testid="run-level-next">
          @if (level().nextDisc; as next) {
            {{ 'runs.level.next' | translate: { disc: (next.key | translate), points: format(level().pointsToNext ?? 0) } }}
          } @else {
            {{ 'runs.level.top' | translate }}
          }
        </p>
        @if (reviewLink(); as link) {
          <a [routerLink]="link" class="shrink-0 underline underline-offset-4 touch-manipulation" style="color:var(--text-hi)" data-testid="run-level-review">{{ 'runs.level.review' | translate }}</a>
        }
      </div>
      }
    </section>
  `,
})
export class RunLevelCardComponent {
  readonly level = input.required<RunLevel>();
  readonly lang = input<'fr' | 'en'>('fr');
  /** Le lien de la partie dans l'historique ; `null` : pas de « Revoir ». */
  readonly reviewLink = input<string | null>(null);
  /** Sur la fin d'un run : « 17 / 20 morceaux trouvés », montré avec « Revoir » à la place du disque suivant (annoncé par le bouton). */
  readonly found = input<string | null>(null);

  private readonly numbers = computed(() => new Intl.NumberFormat(this.lang()));
  protected readonly delta = computed(() => levelDeltaText(this.level().delta, (value) => this.format(value)));
  protected readonly rising = computed(() => (this.level().delta ?? 0) > 0);

  /** « 1 380 » : les grands nombres au format de la langue. */
  protected format(value: number): string {
    return this.numbers().format(value);
  }
}
