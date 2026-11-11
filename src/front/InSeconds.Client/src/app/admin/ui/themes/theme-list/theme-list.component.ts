import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { THEME_MAX_LENGTH } from '../../../domain/pool-track';
import { MIN_PLAYABLE_TRACKS, ThemeFilter, ThemeRow, VARIED_FROM_TRACKS, filterThemes, missingTracks } from '../../../domain/themes';
import { HEALTH_COLOR } from '../health-style';

/**
 * La liste des thèmes : une recherche par nom, des puces par état (tous, pas jouables, peu variés, variés), un formulaire pour en créer un,
 * puis une carte par thème avec sa pastille et sa jauge. Un tap sur une carte l'ouvre dans le détail.
 */
@Component({
  selector: 'app-theme-list',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-3">
      <input type="search" class="app-input" [value]="text()" (input)="text.set(valueOf($event))"
        [placeholder]="'admin.themes.search' | translate" [attr.aria-label]="'admin.themes.search' | translate" data-testid="theme-search" />

      <div class="flex flex-wrap gap-2" role="group" [attr.aria-label]="'admin.themes.filters' | translate">
        @for (chip of chips(); track chip.id) {
          <button type="button" (click)="filter.set(chip.id)" [attr.aria-pressed]="filter() === chip.id"
            class="text-sm px-3 py-1.5 rounded-full" data-testid="theme-chip"
            [style.color]="filter() === chip.id ? 'var(--text-hi)' : 'var(--text-muted)'"
            [style.background]="filter() === chip.id ? 'var(--text-sep)' : 'transparent'" style="border:1px solid var(--border-neutral)">
            {{ chip.label | translate }} · {{ chip.count }}
          </button>
        }
      </div>

      <form class="flex items-center gap-2" (submit)="submit($event)">
        <input type="text" class="app-input flex-1" [value]="draft()" [attr.maxlength]="maxLength" (input)="draft.set(valueOf($event))"
          [attr.aria-label]="'admin.themes.newName' | translate" [placeholder]="'admin.themes.newName' | translate" data-testid="theme-new" />
        <button type="submit" class="text-sm py-2 px-4 rounded-lg disabled:opacity-40" style="border:1px solid var(--border-neutral);color:var(--text-hi)"
          [disabled]="!draft().trim()">{{ 'admin.themes.create' | translate }}</button>
      </form>

      @if (errorKey(); as key) {
        <p role="alert" class="text-xs" style="color:var(--text-error)" data-testid="themes-error">{{ key | translate }}</p>
      }

      <ul class="flex flex-col gap-2.5">
        @for (row of shown(); track row.id) {
          <li>
            <button type="button" (click)="select.emit(row.id)" class="w-full text-left rounded-2xl p-4 flex flex-col gap-2" data-testid="theme-card"
              style="background:var(--bg-surface-2);border:1px solid var(--border-strong)"
              [style.border-color]="row.id === selectedId() ? 'var(--border-neutral)' : null" [attr.aria-current]="row.id === selectedId() ? 'true' : null">
              <span class="flex items-center justify-between gap-3">
                <span class="font-semibold truncate" style="color:var(--text-hi)">{{ row.name }}</span>
                <span class="shrink-0 inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full" [style.color]="color[row.health]"
                  [style.border]="'1px solid ' + color[row.health]">
                  <span aria-hidden="true" class="w-2 h-2 rounded-full" [style.background]="color[row.health]"></span>
                  {{ 'admin.themes.health.' + row.health | translate }}
                </span>
              </span>
              <span class="text-sm" style="color:var(--text-muted)">{{ 'admin.themes.counts' | translate: { total: row.total, playable: row.playable } }}</span>
              <span class="h-1.5 rounded-full w-full" style="background:var(--text-sep)">
                <span class="block h-full rounded-full" [style.background]="color[row.health]" [style.width.%]="barWidth(row)"></span>
              </span>
              @if (row.health === 'unplayable') {
                <span class="text-sm" style="color:var(--text-error)">{{ 'admin.themes.missing' | translate: { count: missing(row) } }}</span>
              }
            </button>
          </li>
        } @empty {
          <li class="text-sm" style="color:var(--text-muted)" data-testid="themes-empty">{{ 'admin.themes.empty' | translate }}</li>
        }
      </ul>
      <p class="text-xs" style="color:var(--text-faint)">{{ 'admin.themes.legend' | translate: { min: minPlayable, varied: variedFrom } }}</p>
    </div>
  `,
})
export class ThemeListComponent {
  readonly rows = input.required<readonly ThemeRow[]>();
  readonly selectedId = input<number | null>(null);
  /** La clé de traduction de la dernière erreur (nom pris), vide sinon. */
  readonly errorKey = input<string | null>(null);
  readonly select = output<number>();
  readonly add = output<string>();

  protected readonly color = HEALTH_COLOR;
  protected readonly maxLength = THEME_MAX_LENGTH;
  protected readonly minPlayable = MIN_PLAYABLE_TRACKS;
  protected readonly variedFrom = VARIED_FROM_TRACKS;
  protected readonly text = signal('');
  protected readonly filter = signal<ThemeFilter>('all');
  protected readonly draft = signal('');

  protected readonly shown = computed(() => filterThemes(this.rows(), this.text(), this.filter()));
  protected readonly chips = computed(() => {
    const rows = this.rows();
    const count = (health: ThemeFilter) => (health === 'all' ? rows.length : rows.filter(r => r.health === health).length);
    return (['all', 'unplayable', 'thin', 'varied'] as const).map(id => ({ id, label: `admin.themes.chip.${id}`, count: count(id) }));
  });

  protected missing(row: ThemeRow): number {
    return missingTracks(row.playable);
  }

  /** La jauge se remplit jusqu'au seuil « varié » : pleine = vert. */
  protected barWidth(row: ThemeRow): number {
    return Math.min(100, Math.round((row.playable / VARIED_FROM_TRACKS) * 100));
  }

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const name = this.draft().trim();
    if (!name) return;
    this.add.emit(name);
    this.draft.set('');
  }
}
