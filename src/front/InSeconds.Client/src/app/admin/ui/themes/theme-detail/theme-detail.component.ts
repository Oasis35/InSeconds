import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { PoolTrack, THEME_MAX_LENGTH } from '../../../domain/pool-track';
import { ThemeRow, filterByLabel, isPlayableTrack, missingTracks } from '../../../domain/themes';
import { HEALTH_COLOR } from '../health-style';

/**
 * Le détail d'un thème : son nom (renommable), son état, l'avertissement quand il manque des morceaux jouables, et la liste de ses morceaux
 * avec le bouton d'écoute du pool (▶) et un ✕ qui le retire du thème (il reste dans le pool). Une recherche filtre la liste.
 */
@Component({
  selector: 'app-theme-detail',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-3">
      <div class="flex items-center justify-between gap-3">
        <button type="button" class="text-sm lg:hidden" style="color:var(--text-muted)" (click)="back.emit()" data-testid="theme-back">
          ‹ {{ 'admin.themes.back' | translate }}
        </button>
        <span class="flex items-center gap-4 text-sm ml-auto" style="color:var(--text-muted)">
          <button type="button" class="underline" (click)="editing.set(!editing())" data-testid="theme-rename">{{ 'admin.themes.rename' | translate }}</button>
          <button type="button" class="underline disabled:opacity-40 disabled:no-underline" style="color:var(--text-error)"
            [disabled]="theme().total > 0" [title]="(theme().total > 0 ? 'admin.themes.deleteBlocked' : 'admin.themes.delete') | translate"
            (click)="remove.emit()" data-testid="theme-delete">{{ 'admin.themes.delete' | translate }}</button>
        </span>
      </div>

      @if (editing()) {
        <input type="text" class="app-input" [value]="theme().name" [attr.maxlength]="maxLength" [attr.aria-label]="'admin.themes.name' | translate"
          (change)="rename.emit(valueOf($event)); editing.set(false)" data-testid="theme-name-input" />
      } @else {
        <h2 class="text-xl font-semibold flex flex-wrap items-center gap-3" style="color:var(--text-hi)">
          {{ theme().name }}
          <span class="text-xs font-normal inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full" [style.color]="color[theme().health]"
            [style.border]="'1px solid ' + color[theme().health]">
            <span aria-hidden="true" class="w-2 h-2 rounded-full" [style.background]="color[theme().health]"></span>
            {{ 'admin.themes.health.' + theme().health | translate }}
          </span>
        </h2>
      }
      <p class="text-sm" style="color:var(--text-muted)">{{ 'admin.themes.counts' | translate: { total: theme().total, playable: theme().playable } }}</p>

      @if (theme().health === 'unplayable') {
        <p class="rounded-lg px-3 py-2 text-sm" role="status" data-testid="theme-warning"
          style="background:rgb(var(--rgb-danger) / 0.1);border:1px solid rgb(var(--rgb-danger) / 0.4);color:var(--text-error)">
          {{ 'admin.themes.missing' | translate: { count: missing() } }}
        </p>
      }

      @if (errorKey(); as key) {
        <p role="alert" class="text-xs" style="color:var(--text-error)" data-testid="theme-error">{{ key | translate }}</p>
      }

      <button type="button" (click)="addTracks.emit()" data-testid="theme-add-open"
        class="py-3 px-4 rounded-(--radius-button) font-bold uppercase tracking-wide text-sm"
        style="background:var(--gradient-primary);color:var(--text-on-primary)">{{ 'admin.themes.addTracks' | translate }}</button>

      @if (tracks().length > 0) {
        <input type="search" class="app-input" [value]="text()" (input)="text.set(valueOf($event))"
          [placeholder]="'admin.themes.searchInTheme' | translate" [attr.aria-label]="'admin.themes.searchInTheme' | translate" data-testid="theme-track-search" />
      }

      <ul class="rounded-2xl px-3" style="background:var(--bg-surface-2);border:1px solid var(--border-strong)">
        @for (track of shown(); track track.id) {
          <li class="flex items-center gap-3 py-2.5" data-testid="theme-track" style="border-top:1px solid var(--border-subtle)"
            [class.opacity-50]="!playable(track)">
            <button type="button" (click)="listen.emit(track)" class="text-xs px-2 py-1 rounded shrink-0 transition-colors"
              style="color:var(--text-indigo);border:1px solid rgb(var(--rgb-violet) / 0.3)" [title]="'admin.pool.listenTitle' | translate"
              [attr.aria-label]="'admin.pool.listenTitle' | translate">▶</button>
            <span class="flex-1 min-w-0 flex flex-col">
              <span class="truncate text-sm" style="color:var(--text-hi)">{{ track.title }}</span>
              <span class="truncate text-xs" style="color:var(--text-muted)">{{ track.artist }}</span>
            </span>
            @if (track.isDisabled) {
              <span class="text-[11px] px-1.5 rounded" style="color:var(--color-warn);border:1px solid var(--color-warn)">{{ 'admin.themes.disabled' | translate }}</span>
            } @else if (track.preview !== 'available') {
              <span class="text-[11px] px-1.5 rounded" style="color:var(--color-warn);border:1px solid var(--color-warn)">{{ 'admin.themes.noPreview' | translate }}</span>
            }
            <button type="button" (click)="removeTrack.emit(track)" class="w-8 h-8 rounded-full shrink-0 flex items-center justify-center"
              style="color:var(--text-muted);border:1px solid var(--border-neutral)" [title]="'admin.themes.removeTrack' | translate"
              [attr.aria-label]="'admin.themes.removeTrack' | translate" data-testid="theme-track-remove">✕</button>
          </li>
        } @empty {
          <li class="py-3 text-sm" style="color:var(--text-muted)" data-testid="theme-tracks-empty">{{ 'admin.themes.noTracks' | translate }}</li>
        }
      </ul>
    </div>
  `,
})
export class ThemeDetailComponent {
  readonly theme = input.required<ThemeRow>();
  /** Les morceaux du thème. */
  readonly tracks = input.required<readonly PoolTrack[]>();
  readonly errorKey = input<string | null>(null);
  readonly back = output();
  readonly rename = output<string>();
  readonly remove = output();
  readonly addTracks = output();
  readonly listen = output<PoolTrack>();
  readonly removeTrack = output<PoolTrack>();

  protected readonly color = HEALTH_COLOR;
  protected readonly maxLength = THEME_MAX_LENGTH;
  protected readonly editing = signal(false);
  protected readonly text = signal('');
  protected readonly shown = computed(() => filterByLabel(this.tracks(), this.text()));
  protected readonly missing = computed(() => missingTracks(this.theme().playable));
  protected readonly playable = isPlayableTrack;

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value.trim();
  }
}
