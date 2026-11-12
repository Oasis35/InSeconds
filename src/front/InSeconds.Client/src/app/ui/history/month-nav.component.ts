import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { monthLabel } from '../format/day-label';

/** ‹ Novembre 2026 › : un mois à la fois. Les flèches sont de vrais liens (`?mois=aaaa-mm`), éteintes quand il n'y a rien de ce côté. */
@Component({
  selector: 'app-month-nav',
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center justify-between">
      @if (previous(); as month) {
        <a [routerLink]="[]" [queryParams]="{ mois: month }" class="arrow" data-testid="month-previous" [attr.aria-label]="'ui.history.previousMonth' | translate">‹</a>
      } @else {
        <span class="arrow off" aria-hidden="true">‹</span>
      }
      <span class="text-base font-semibold" style="font-family:var(--font-display);color:var(--text-hi)" data-testid="month-label">{{ label() }}</span>
      @if (next(); as month) {
        <a [routerLink]="[]" [queryParams]="{ mois: month }" class="arrow" data-testid="month-next" [attr.aria-label]="'ui.history.nextMonth' | translate">›</a>
      } @else {
        <span class="arrow off" aria-hidden="true">›</span>
      }
    </div>
  `,
  styles: `
    .arrow { display: inline-flex; align-items: center; justify-content: center; min-width: 44px; min-height: 44px; font-size: 1.5rem; color: var(--text-light); }
    .arrow.off { opacity: .25; }
  `,
})
export class MonthNavComponent {
  readonly month = input.required<string>();
  readonly previous = input<string | null>(null);
  readonly next = input<string | null>(null);
  readonly lang = input('fr');

  protected readonly label = computed(() => monthLabel(this.month(), this.lang()));
}
