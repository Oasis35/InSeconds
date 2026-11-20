import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { formatGameDate } from '../../domain/archive';

/**
 * En-tête de la page d'un jour passé : ‹ jour d'avant, la date (le titre de la page), jour d'après ›. Les flèches
 * sont de vrais liens (un moteur de recherche les suit) ; sans jour d'avant ou d'après, la flèche reste à sa place, éteinte.
 */
@Component({
  selector: 'app-archive-day-header',
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center gap-2" data-testid="archive-day-header">
      @if (previousDate(); as previous) {
        <a [routerLink]="['/history/daily', previous]" class="nav" data-testid="archive-previous"
           [attr.aria-label]="'daily.archive.previousDay' | translate">‹</a>
      } @else {
        <span class="nav nav--off" aria-hidden="true">‹</span>
      }

      <h1 class="flex-1 min-w-0 flex flex-col items-center leading-tight text-center" data-testid="archive-date">
        <span class="text-xs" style="color:var(--text-muted)">{{ 'daily.archive.titlePrefix' | translate }}</span>
        <span class="text-[17px] font-bold truncate max-w-full" style="font-family:var(--font-display);color:var(--text-hi)">{{ label() }}</span>
      </h1>

      @if (nextDate(); as next) {
        <a [routerLink]="['/history/daily', next]" class="nav" data-testid="archive-next"
           [attr.aria-label]="'daily.archive.nextDay' | translate">›</a>
      } @else {
        <span class="nav nav--off" aria-hidden="true">›</span>
      }
    </div>
  `,
  styles: `
    .nav {
      flex-shrink: 0;
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid var(--border-neutral);
      border-radius: var(--radius-button);
      color: var(--text-hi);
      font-size: 22px;
      line-height: 1;
      transition: background-color 0.15s;
    }
    a.nav:hover { background: rgb(255 255 255 / 0.04); }
    .nav--off { opacity: 0.3; }
  `,
})
export class ArchiveDayHeaderComponent {
  /** `aaaa-mm-jj`. */
  readonly date = input.required<string>();
  readonly previousDate = input<string | null>(null);
  readonly nextDate = input<string | null>(null);
  readonly lang = input<'fr' | 'en'>('fr');

  protected readonly label = computed(() => formatGameDate(this.date(), this.lang()));
}
