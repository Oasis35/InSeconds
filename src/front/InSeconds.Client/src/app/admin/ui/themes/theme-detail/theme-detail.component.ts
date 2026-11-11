import { ChangeDetectionStrategy, Component, computed, effect, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { PoolTrack, THEME_MAX_LENGTH } from '../../../domain/pool-track';
import { ThemeRow, filterByLabel, isPlayableTrack, missingTracks } from '../../../domain/themes';
import { HEALTH_COLOR } from '../health-style';
import { ButtonComponent } from '../../../../ui/button/button.component';
import { ThemeIconComponent } from '../../../../ui/theme-icon/theme-icon.component';

/** Morceaux par page de la liste d'un thème. */
export const THEME_PAGE_SIZE = 10;

/**
 * Le détail d'un thème : son nom (renommable), son état, l'avertissement quand il manque des morceaux jouables, et la liste de ses morceaux
 * avec le bouton d'écoute du pool (▶) et un ✕ qui le retire du thème (il reste dans le pool). Une recherche filtre la liste, paginée par 10 (la page est rendue à la page du thème).
 */
@Component({
  selector: 'app-theme-detail',
  imports: [TranslatePipe, ButtonComponent, ThemeIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-2.5">
      <button type="button" class="text-sm lg:hidden min-h-11 inline-flex items-center self-start" style="color:var(--text-muted)" (click)="back.emit()" data-testid="theme-back">
        ‹ {{ 'admin.themes.back' | translate }}
      </button>

      <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
        @if (editing()) {
          <input type="text" class="app-input flex-1 min-w-48" [value]="theme().name" [attr.maxlength]="maxLength" [attr.aria-label]="'admin.themes.name' | translate"
            (change)="renameTo(valueOf($event))" data-testid="theme-name-input" />
        } @else {
          <h2 class="text-xl font-semibold flex flex-wrap items-center gap-3" style="color:var(--text-hi)">
            <span class="inline-flex items-center gap-2">
              <app-theme-icon [name]="theme().icon" [size]="22" />
              {{ theme().name }}
            </span>
            <span class="text-xs font-normal inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full" [style.color]="color[theme().health]"
              [style.border]="'1px solid ' + color[theme().health]">
              <span aria-hidden="true" class="w-2 h-2 rounded-full" [style.background]="color[theme().health]"></span>
              {{ 'admin.themes.health.' + theme().health | translate }}
            </span>
          </h2>
        }
        <button type="button" appButton variant="neutral" size="sm" (click)="pickIcon.emit()" data-testid="theme-icon-open">{{ 'admin.themes.changeIcon' | translate }}</button>
        <span class="flex flex-wrap items-center gap-2 lg:ml-auto">
          <button type="button" appButton (click)="addTracks.emit()" data-testid="theme-add-open">{{ 'admin.themes.addTracks' | translate }}</button>
          <button type="button" appButton variant="neutral" size="sm" (click)="editing.set(!editing())" data-testid="theme-rename">{{ 'admin.themes.rename' | translate }}</button>
          <button type="button" appButton variant="neutral" size="sm" [disabled]="theme().total > 0"
            [title]="(theme().total > 0 ? 'admin.themes.deleteBlocked' : 'admin.themes.delete') | translate"
            (click)="remove.emit()" data-testid="theme-delete">{{ 'admin.themes.delete' | translate }}</button>
        </span>
      </div>
      <p class="text-sm" style="color:var(--text-muted)">{{ 'admin.themes.counts' | translate: { total: theme().total, playable: theme().playable } }}</p>

      @if (theme().health === 'unplayable') {
        <p class="rounded-(--radius-button) px-3 py-2 text-sm" role="status" data-testid="theme-warning"
          style="background:rgb(var(--rgb-danger) / 0.1);border:1px solid rgb(var(--rgb-danger) / 0.4);color:var(--text-error)">
          {{ 'admin.themes.missing' | translate: { count: missing() } }}
        </p>
      }

      @if (errorKey(); as key) {
        <p role="alert" class="text-xs" style="color:var(--text-error)" data-testid="theme-error">{{ key | translate }}</p>
      }

      @if (tracks().length > 0) {
        <input type="search" class="app-input" [value]="text()" (input)="search($event)"
          [placeholder]="'admin.themes.searchInTheme' | translate" [attr.aria-label]="'admin.themes.searchInTheme' | translate" data-testid="theme-track-search" />
      }

      <ul class="rounded-(--radius-card) px-3" style="background:var(--bg-surface-2);border:1px solid var(--border-strong)">
        @for (track of visible(); track track.id) {
          <li class="flex items-center gap-3 py-1.5" data-testid="theme-track" style="border-top:1px solid var(--border-subtle)"
            [class.opacity-50]="!playable(track)">
            <button type="button" (click)="listen.emit(track)" class="text-xs min-h-11 min-w-11 inline-flex items-center justify-center rounded-(--radius-button) shrink-0 transition-colors lg:min-h-9 lg:min-w-9 lg:h-9"
              style="color:var(--text-indigo);border:1px solid rgb(var(--rgb-violet) / 0.3)" [title]="'admin.pool.listenTitle' | translate"
              [attr.aria-label]="'admin.pool.listenTitle' | translate">▶</button>
            <span class="flex-1 min-w-0 flex flex-col lg:flex-row lg:items-baseline lg:gap-3">
              <span class="truncate text-sm" style="color:var(--text-hi)">{{ track.title }}</span>
              <span class="truncate text-xs" style="color:var(--text-muted)">{{ track.artist }}</span>
            </span>
            @if (track.isDisabled) {
              <span class="text-xs" style="color:var(--color-warn)">{{ 'admin.themes.disabled' | translate }}</span>
            } @else if (track.preview !== 'available') {
              <span class="text-xs" style="color:var(--color-warn)">{{ 'admin.themes.noPreview' | translate }}</span>
            }
            <button type="button" (click)="removeTrack.emit(track)" class="w-11 h-11 lg:w-9 lg:h-9 rounded-full shrink-0 flex items-center justify-center"
              style="color:var(--text-muted);border:1px solid var(--border-neutral)" [title]="'admin.themes.removeTrack' | translate"
              [attr.aria-label]="'admin.themes.removeTrack' | translate" data-testid="theme-track-remove">✕</button>
          </li>
        } @empty {
          <li class="py-3 text-sm" style="color:var(--text-muted)" data-testid="theme-tracks-empty">{{ 'admin.themes.noTracks' | translate }}</li>
        }
      </ul>

      @if (pages() > 1) {
        <nav class="flex items-center justify-between gap-2" [attr.aria-label]="'admin.themes.pagination' | translate" data-testid="theme-pager">
          <button type="button" appButton variant="neutral" size="sm" [disabled]="current() === 0" (click)="goTo(current() - 1)" data-testid="theme-page-prev">
            ← {{ 'admin.themes.previous' | translate }}
          </button>
          <span class="text-sm" style="color:var(--text-muted)" data-testid="theme-page-label">{{ 'admin.themes.pageOf' | translate: { current: current() + 1, total: pages() } }}</span>
          <button type="button" appButton variant="neutral" size="sm" [disabled]="current() >= pages() - 1" (click)="goTo(current() + 1)" data-testid="theme-page-next">
            {{ 'admin.themes.next' | translate }} →
          </button>
        </nav>
      }
    </div>
  `,
})
export class ThemeDetailComponent {
  readonly theme = input.required<ThemeRow>();
  /** Les morceaux du thème. */
  readonly tracks = input.required<readonly PoolTrack[]>();
  readonly errorKey = input<string | null>(null);
  /** La page affichée, à partir de 0 : la page du thème la garde (elle vit dans l'adresse). */
  readonly page = input(0);
  readonly pageChange = output<number>();
  readonly back = output();
  readonly rename = output<string>();
  readonly remove = output();
  readonly addTracks = output();
  readonly pickIcon = output();
  readonly listen = output<PoolTrack>();
  readonly removeTrack = output<PoolTrack>();

  protected readonly color = HEALTH_COLOR;
  protected readonly maxLength = THEME_MAX_LENGTH;
  protected readonly editing = signal(false);
  protected readonly text = signal('');
  protected readonly shown = computed(() => filterByLabel(this.tracks(), this.text()));
  protected readonly pages = computed(() => Math.max(1, Math.ceil(this.shown().length / THEME_PAGE_SIZE)));
  /** La page à montrer : une page au-delà de la dernière (un morceau retiré, un lien ancien) retombe sur la dernière. */
  protected readonly current = computed(() => Math.min(this.page(), this.pages() - 1));
  protected readonly visible = computed(() => this.shown().slice(this.current() * THEME_PAGE_SIZE, (this.current() + 1) * THEME_PAGE_SIZE));
  protected readonly missing = computed(() => missingTracks(this.theme().playable));
  protected readonly playable = isPlayableTrack;

  constructor() {
    // La page ramenée à la dernière existante est aussi rendue à la page du thème, donc à l'adresse.
    effect(() => {
      if (this.current() !== this.page()) this.pageChange.emit(this.current());
    });
  }

  protected goTo(page: number): void {
    this.pageChange.emit(page);
  }

  /** Chercher dans le thème repart de la première page. */
  protected search(event: Event): void {
    this.text.set(this.valueOf(event));
    this.pageChange.emit(0);
  }

  /** Un nom vide ou inchangé n'est pas envoyé. */
  protected renameTo(name: string): void {
    this.editing.set(false);
    if (name && name !== this.theme().name) this.rename.emit(name);
  }

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value.trim();
  }
}
