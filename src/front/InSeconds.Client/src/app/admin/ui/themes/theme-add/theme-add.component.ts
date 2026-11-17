import { ChangeDetectionStrategy, Component, WritableSignal, computed, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { DeezerResult, PoolTrack } from '../../../domain/pool-track';
import { filterByLabel, isPlayableTrack } from '../../../domain/themes';
import { ButtonComponent } from '../../../../ui/button/button.component';

type Source = 'pool' | 'deezer';
type AddStatus = 'loading' | 'success' | 'error';

/** Les morceaux du pool s'affichent par tranches de cette taille : « Voir plus » en ajoute, la recherche filtre toujours tout le pool. */
const PAGE_SIZE = 50;

/**
 * L'ajout de morceaux à un thème : « Dans le pool » (recherche, cases à cocher, un bouton qui ajoute tous les morceaux cochés) ou « Sur Deezer »
 * (recherche Deezer ; un résultat s'ajoute d'un geste au pool puis au thème). Chaque ligne s'écoute avec le même ▶ que le pool.
 */
@Component({
  selector: 'app-theme-add',
  imports: [TranslatePipe, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-3">
      <div class="flex items-center justify-between gap-3">
        <h3 class="text-base font-semibold" style="color:var(--text-hi)">{{ 'admin.themes.addTracks' | translate }}</h3>
        <button type="button" class="text-sm underline min-h-11 px-2" style="color:var(--text-muted)" (click)="closed.emit()" data-testid="theme-add-close">{{ 'admin.themes.close' | translate }}</button>
      </div>

      <div class="flex gap-2" role="group">
        @for (s of sources; track s) {
          <button type="button" (click)="source.set(s)" [attr.aria-pressed]="source() === s" class="text-sm px-3 py-1.5 rounded-full" data-testid="theme-add-source"
            [style.color]="source() === s ? 'var(--text-hi)' : 'var(--text-muted)'" [style.background]="source() === s ? 'var(--text-sep)' : 'transparent'"
            style="border:1px solid var(--border-neutral)">{{ 'admin.themes.source.' + s | translate }}</button>
        }
      </div>

      @if (source() === 'pool') {
        <input type="search" class="app-input" [value]="text()" (input)="onSearch(valueOf($event))"
          [placeholder]="'admin.themes.searchPool' | translate" [attr.aria-label]="'admin.themes.searchPool' | translate" data-testid="theme-pool-search" />
        <div class="flex flex-wrap items-center gap-2" data-testid="theme-pool-filters">
          <input type="number" inputmode="numeric" class="app-input w-24" [value]="yearFrom()" (input)="onYear(yearFrom, valueOf($event))"
            [placeholder]="'admin.themes.yearFrom' | translate" [attr.aria-label]="'admin.themes.yearFrom' | translate" data-testid="theme-year-from" />
          <input type="number" inputmode="numeric" class="app-input w-24" [value]="yearTo()" (input)="onYear(yearTo, valueOf($event))"
            [placeholder]="'admin.themes.yearTo' | translate" [attr.aria-label]="'admin.themes.yearTo' | translate" data-testid="theme-year-to" />
          <select class="app-input flex-1 min-w-32" [value]="genre()" (change)="onGenre(valueOf($event))" [attr.aria-label]="'admin.themes.genre' | translate" data-testid="theme-genre">
            <option value="">{{ 'admin.themes.allGenres' | translate }}</option>
            @for (g of genres(); track g) {
              <option [value]="g">{{ g }}</option>
            }
          </select>
        </div>
        @if (candidates().length > 0) {
          <button type="button" class="text-sm underline min-h-11 self-start px-2" style="color:var(--text-muted)" (click)="pickAll()" data-testid="theme-pick-all">
            {{ 'admin.themes.pickAll' | translate: { count: candidates().length } }}
          </button>
        }
        <ul class="rounded-(--radius-card) px-3" style="background:var(--bg-surface-2);border:1px solid var(--border-strong)">
          @for (track of visible(); track track.id) {
            <li class="flex items-center gap-3 py-2.5" style="border-top:1px solid var(--border-subtle)" data-testid="theme-candidate">
              <input type="checkbox" class="w-6 h-6 shrink-0 cursor-pointer" [checked]="picked().includes(track.id)" (change)="toggle(track.id)"
                [attr.aria-label]="track.artist + ' - ' + track.title" />
              <button type="button" (click)="listen.emit(track)" class="text-xs min-h-11 min-w-11 inline-flex items-center justify-center rounded-(--radius-button) shrink-0"
                style="color:var(--text-indigo);border:1px solid rgb(var(--rgb-violet) / 0.3)" [title]="'admin.pool.listenTitle' | translate"
                [attr.aria-label]="'admin.pool.listenTitle' | translate">▶</button>
              <span class="flex-1 min-w-0 flex flex-col">
                <span class="truncate text-sm" style="color:var(--text-hi)">{{ track.title }}</span>
                <span class="truncate text-xs" style="color:var(--text-muted)">{{ track.artist }}</span>
              </span>
            </li>
          } @empty {
            <li class="py-3 text-sm" style="color:var(--text-muted)">{{ 'admin.themes.noCandidate' | translate }}</li>
          }
        </ul>
        @if (hidden() > 0) {
          <button type="button" class="text-sm underline min-h-11 self-center px-2" style="color:var(--text-muted)" (click)="showMore()" data-testid="theme-show-more">
            {{ 'admin.themes.showMore' | translate: { count: hidden() } }}
          </button>
        }
        <button type="button" appButton [disabled]="picked().length === 0" (click)="submit()" data-testid="theme-add-submit">
          {{ 'admin.themes.addPicked' | translate: { count: picked().length } }}
        </button>
      } @else {
        <input type="search" class="app-input" [value]="deezerQuery()" (input)="deezerQueryChange.emit(valueOf($event))"
          [placeholder]="'admin.themes.searchDeezer' | translate" [attr.aria-label]="'admin.themes.searchDeezer' | translate" data-testid="theme-deezer-search" />
        @if (searching()) {
          <p class="text-xs" style="color:var(--text-muted)">{{ 'admin.addPanel.searching' | translate }}</p>
        }
        @if (searchErrorKey(); as key) {
          <p role="alert" class="text-xs" style="color:var(--text-error)">{{ key | translate }}</p>
        }
        <ul class="rounded-(--radius-card) px-3" style="background:var(--bg-surface-2);border:1px solid var(--border-strong)">
          @for (result of deezerResults(); track result.deezerTrackId) {
            <li class="flex items-center gap-3 py-2.5" style="border-top:1px solid var(--border-subtle)" data-testid="theme-deezer-result">
              <button type="button" (click)="previewResult.emit(result)" [disabled]="!result.previewUrl" class="text-xs min-h-11 min-w-11 inline-flex items-center justify-center rounded-(--radius-button) shrink-0 disabled:opacity-30"
                style="color:var(--text-indigo);border:1px solid rgb(var(--rgb-violet) / 0.3)" [title]="'admin.pool.listenTitle' | translate"
                [attr.aria-label]="'admin.pool.listenTitle' | translate">▶</button>
              <span class="flex-1 min-w-0 flex flex-col">
                <span class="truncate text-sm" style="color:var(--text-hi)">{{ result.title }}</span>
                <span class="truncate text-xs" style="color:var(--text-muted)">{{ result.artist }}</span>
                @if (inTheme().has(result.deezerTrackId)) {
                  <span class="text-xs" style="color:var(--color-warn)">{{ 'admin.themes.alreadyInTheme' | translate }}</span>
                } @else if (inPool().has(result.deezerTrackId)) {
                  <span class="text-xs" style="color:var(--text-muted)">{{ 'admin.addPanel.alreadyInPool' | translate }}</span>
                }
              </span>
              @let status = statuses()[result.deezerTrackId];
              <button type="button" (click)="addDeezer.emit(result)" [disabled]="status === 'loading' || inTheme().has(result.deezerTrackId)"
                [title]="'admin.themes.addDeezer' | translate" [attr.aria-label]="'admin.themes.addDeezer' | translate"
                class="w-11 h-11 rounded-(--radius-button) flex items-center justify-center text-lg font-semibold shrink-0 disabled:opacity-40"
                style="background:var(--bg-primary-dk);color:var(--text-on-orange)">
                @switch (status) {
                  @case ('loading') { … }
                  @case ('success') { ✓ }
                  @case ('error') { ! }
                  @default { + }
                }
              </button>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class ThemeAddComponent {
  /** Les morceaux du pool, ceux du thème comprises (ils sont écartés de la liste). */
  readonly poolTracks = input.required<readonly PoolTrack[]>();
  readonly themeId = input.required<number>();
  readonly deezerQuery = input('');
  readonly deezerResults = input<readonly DeezerResult[]>([]);
  readonly searching = input(false);
  readonly searchErrorKey = input<string | null>(null);
  readonly statuses = input<Readonly<Record<number, AddStatus>>>({});

  readonly closed = output();
  readonly listen = output<PoolTrack>();
  readonly previewResult = output<DeezerResult>();
  readonly deezerQueryChange = output<string>();
  /** Les identifiants des morceaux du pool cochés. */
  readonly addPicked = output<readonly number[]>();
  readonly addDeezer = output<DeezerResult>();

  protected readonly sources: readonly Source[] = ['pool', 'deezer'];
  protected readonly source = signal<Source>('pool');
  protected readonly text = signal('');
  protected readonly picked = signal<readonly number[]>([]);
  protected readonly yearFrom = signal('');
  protected readonly yearTo = signal('');
  protected readonly genre = signal('');

  private readonly limit = signal(PAGE_SIZE);

  protected readonly candidates = computed(() => {
    const id = this.themeId();
    const free = this.poolTracks().filter(t => !t.themeIds.includes(id));
    // Les morceaux jouables d'abord : ce sont eux qui font monter la jauge du thème.
    const from = Number(this.yearFrom());
    const to = Number(this.yearTo());
    const genre = this.genre();
    const filtered = filterByLabel(free, this.text()).filter(t =>
      (!this.yearFrom() || (t.releaseYear !== null && t.releaseYear >= from))
      && (!this.yearTo() || (t.releaseYear !== null && t.releaseYear <= to))
      && (!genre || t.genres.includes(genre)));
    return filtered.sort((a, b) => Number(isPlayableTrack(b)) - Number(isPlayableTrack(a)));
  });
  protected readonly genres = computed(() => [...new Set(this.poolTracks().flatMap(t => t.genres))].sort((a, b) => a.localeCompare(b, 'fr')));
  protected readonly visible = computed(() => this.candidates().slice(0, this.limit()));
  protected readonly hidden = computed(() => Math.max(0, this.candidates().length - this.limit()));
  protected readonly inPool = computed(() => new Set(this.poolTracks().map(t => t.deezerTrackId)));
  protected readonly inTheme = computed(() => {
    const id = this.themeId();
    return new Set(this.poolTracks().filter(t => t.themeIds.includes(id)).map(t => t.deezerTrackId));
  });

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected onSearch(value: string): void {
    this.text.set(value);
    this.limit.set(PAGE_SIZE);
  }

  protected onYear(field: WritableSignal<string>, value: string): void {
    field.set(value.trim());
    this.limit.set(PAGE_SIZE);
  }

  protected onGenre(value: string): void {
    this.genre.set(value);
    this.limit.set(PAGE_SIZE);
  }

  /** Coche tous les morceaux que les filtres laissent (pas seulement ceux qu'on voit : « Voir plus » n'est pas à enchaîner). */
  protected pickAll(): void {
    this.picked.set(this.candidates().map(t => t.id));
  }

  protected showMore(): void {
    this.limit.update(n => n + PAGE_SIZE);
  }

  protected toggle(id: number): void {
    const picked = this.picked();
    this.picked.set(picked.includes(id) ? picked.filter(x => x !== id) : [...picked, id]);
  }

  protected submit(): void {
    this.addPicked.emit(this.picked());
    this.picked.set([]);
  }
}
