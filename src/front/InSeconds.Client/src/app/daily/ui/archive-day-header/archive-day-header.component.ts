import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { formatGameDate } from '../../domain/archive';

/**
 * En-tête de la page d'un jour passé : ‹ jour d'avant, la date (le titre de la page, un toucher ouvre le calendrier), jour d'après ›. Les flèches
 * sont de vrais liens (un moteur de recherche les suit) ; sans jour d'avant ou d'après, la flèche reste à sa place, éteinte.
 */
@Component({
  selector: 'app-archive-day-header',
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center gap-2" data-testid="archive-day-header">
      @if (previousDate(); as previous) {
        <a [routerLink]="['/daily/archive', previous]" class="nav" data-testid="archive-previous"
           [attr.aria-label]="'daily.archive.previousDay' | translate">‹</a>
      } @else {
        <span class="nav nav--off" aria-hidden="true">‹</span>
      }

      <h1 class="flex-1 min-w-0">
        <button type="button" (click)="pickDate.emit()" data-testid="archive-date"
                class="w-full flex items-center justify-center gap-2.5 px-3 py-1.5 rounded-(--radius-button) transition-colors touch-manipulation hover:bg-white/[0.04]"
                style="border:1px solid var(--border-neutral)"
                [attr.aria-label]="'daily.archive.pickDate' | translate: { date: label() }">
          <span class="flex flex-col items-center leading-tight min-w-0">
            <span class="text-[11px]" style="color:var(--text-muted)">{{ 'daily.archive.titlePrefix' | translate }}</span>
            <span class="text-[15px] font-bold truncate" style="font-family:var(--font-display);color:var(--text-hi)">{{ label() }}</span>
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"
               class="shrink-0" style="color:var(--text-muted)" aria-hidden="true">
            <rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>
          </svg>
        </button>
      </h1>

      @if (nextDate(); as next) {
        <a [routerLink]="['/daily/archive', next]" class="nav" data-testid="archive-next"
           [attr.aria-label]="'daily.archive.nextDay' | translate">›</a>
      } @else {
        <span class="nav nav--off" aria-hidden="true">›</span>
      }
    </div>
  `,
  styles: `
    .nav {
      flex-shrink: 0;
      width: 40px;
      height: 40px;
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
  readonly pickDate = output<void>();

  protected readonly label = computed(() => formatGameDate(this.date(), this.lang()));
}
