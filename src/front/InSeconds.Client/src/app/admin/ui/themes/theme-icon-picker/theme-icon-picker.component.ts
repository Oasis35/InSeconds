import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonComponent } from '../../../../ui/button/button.component';
import { ThemeIconComponent } from '../../../../ui/theme-icon/theme-icon.component';
import { THEME_ICON_CATEGORIES, filterThemeIcons } from '../../../../ui/theme-icon/theme-icon';

/**
 * Le choix de l'icône d'un thème : une recherche (nom Lucide ou mot français), des puces de catégorie, la grille du stock, « Sans icône » et
 * « Choisir ». Rien n'est enregistré avant « Choisir » ; une icône hors du stock (retirée depuis) n'est simplement plus surlignée.
 */
@Component({
  selector: 'app-theme-icon-picker',
  imports: [TranslatePipe, ButtonComponent, ThemeIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-3" data-testid="theme-icon-picker">
      <div class="flex items-center justify-between gap-3">
        <h3 class="text-base font-semibold" style="color:var(--text-hi)">{{ 'admin.themes.iconTitle' | translate: { name: themeName() } }}</h3>
        <button type="button" class="text-sm underline min-h-11 px-2" style="color:var(--text-muted)" (click)="close.emit()" data-testid="theme-icon-close">{{ 'admin.themes.close' | translate }}</button>
      </div>

      <input type="search" class="app-input" [value]="query()" (input)="query.set(valueOf($event))" [placeholder]="'admin.themes.iconSearch' | translate"
        [attr.aria-label]="'admin.themes.iconSearch' | translate" data-testid="theme-icon-search" />

      <div class="flex gap-2 overflow-x-auto pb-1" role="group" [attr.aria-label]="'admin.themes.iconCategories' | translate">
        <button type="button" class="icon-chip" [attr.aria-pressed]="category() === null" (click)="category.set(null)" data-testid="theme-icon-category">{{ 'admin.themes.iconAll' | translate }}</button>
        @for (c of categories; track c.id) {
          <button type="button" class="icon-chip" [attr.aria-pressed]="category() === c.id" (click)="category.set(c.id)" data-testid="theme-icon-category">{{ 'admin.themes.iconCat.' + c.id | translate }}</button>
        }
      </div>

      @if (shown().length > 0) {
        <ul class="icon-grid" role="group" [attr.aria-label]="'admin.themes.iconGrid' | translate">
          @for (icon of shown(); track icon.name) {
            <li>
              <button type="button" class="icon-cell" [attr.aria-pressed]="picked() === icon.name" [title]="icon.name" [attr.aria-label]="icon.name"
                (click)="touched.set(icon.name)" data-testid="theme-icon-option">
                <app-theme-icon [name]="icon.name" [size]="24" />
              </button>
            </li>
          }
        </ul>
      } @else {
        <p class="text-sm" style="color:var(--text-muted)" data-testid="theme-icon-empty">{{ 'admin.themes.iconNone' | translate }}</p>
      }

      @if (errorKey(); as key) {
        <p role="alert" class="text-xs" style="color:var(--text-error)" data-testid="theme-icon-error">{{ key | translate }}</p>
      }

      <div class="flex flex-wrap gap-2 justify-end">
        <button type="button" appButton variant="neutral" (click)="choose.emit(null)" data-testid="theme-icon-clear">{{ 'admin.themes.iconClear' | translate }}</button>
        <button type="button" appButton [disabled]="picked() === null || picked() === current()" (click)="choose.emit(picked())" data-testid="theme-icon-save">{{ 'admin.themes.iconChoose' | translate }}</button>
      </div>
    </div>
  `,
  styles: `
    .icon-chip {
      flex: none; min-height: 2.75rem; padding: 0 0.875rem; border-radius: 9999px; font-size: 0.875rem;
      color: var(--text-muted); border: 1px solid var(--border-neutral);
    }
    .icon-chip[aria-pressed='true'] { color: var(--text-hi); border-color: var(--text-hi); background: var(--bg-surface-2); }
    .icon-grid { display: grid; gap: 0.5rem; grid-template-columns: repeat(auto-fill, minmax(2.75rem, 1fr)); }
    .icon-cell {
      width: 100%; aspect-ratio: 1; min-height: 2.75rem; display: grid; place-items: center; border-radius: var(--radius-button);
      color: var(--text-hi); background: var(--bg-surface-2); border: 1px solid var(--border-strong);
    }
    .icon-cell[aria-pressed='true'] { border-color: var(--color-accent); background: rgb(var(--rgb-accent) / 0.12); }
  `,
})
export class ThemeIconPickerComponent {
  /** Le thème qui change d'icône. */
  readonly themeName = input.required<string>();
  /** L'icône qu'il a aujourd'hui (surlignée au départ), `null` : aucune. */
  readonly current = input<string | null>(null);
  /** L'erreur du dernier enregistrement, le sélecteur restant ouvert pour réessayer. */
  readonly errorKey = input<string | null>(null);
  /** L'icône choisie, `null` : « Sans icône ». */
  readonly choose = output<string | null>();
  readonly close = output();

  protected readonly categories = THEME_ICON_CATEGORIES;
  protected readonly query = signal('');
  protected readonly category = signal<string | null>(null);
  protected readonly touched = signal<string | null | undefined>(undefined);
  /** L'icône surlignée : celle qu'on vient de toucher, sinon l'actuelle. */
  protected readonly picked = computed(() => {
    const touched = this.touched();
    return touched === undefined ? this.current() : touched;
  });
  protected readonly shown = computed(() => filterThemeIcons(this.query(), this.category()));

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }
}
