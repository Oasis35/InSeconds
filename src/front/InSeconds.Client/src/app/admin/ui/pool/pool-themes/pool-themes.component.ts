import { ChangeDetectionStrategy, Component, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { PoolTheme, THEME_MAX_LENGTH } from '../../../domain/pool-track';

/**
 * Les thèmes de l'admin, repliés en une ligne en tête de l'onglet Morceaux (« Thèmes : 3 »). Dépliée : la liste (nom modifiable, nombre de
 * morceaux, suppression seulement d'un thème sans morceau) et un champ pour en ajouter un. Les thèmes d'un morceau se choisissent dans la
 * fenêtre de modification du morceau, jamais en saisie libre. Une manche de Platines tire ses morceaux dans l'un d'eux.
 */
@Component({
  selector: 'app-pool-themes',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <details class="group rounded-xl px-4 py-2.5" style="background:var(--bg-surface)" data-testid="themes-setting">
      <summary class="list-none [&::-webkit-details-marker]:hidden cursor-pointer flex items-center justify-between gap-3 text-sm" style="color:var(--text-muted)">
        <span>{{ 'admin.pool.themes.label' | translate }}
          <span class="font-semibold" style="color:var(--text-hi)" data-testid="themes-count">{{ themes().length }}</span></span>
        <span aria-hidden="true" class="transition-transform group-open:rotate-90">⚙</span>
      </summary>
      <div class="flex flex-col gap-3 pt-3">
        <ul class="flex flex-col gap-2">
          @for (theme of themes(); track theme.id) {
            <li class="flex items-center gap-2" data-testid="theme-row">
              <input type="text" class="app-input flex-1" [value]="theme.name" [attr.maxlength]="maxLength" [attr.aria-label]="'admin.pool.themes.name' | translate"
                (change)="rename.emit({ id: theme.id, name: nameOf($event) })" />
              <span class="text-xs tabular-nums w-16 text-right" style="color:var(--text-muted)">{{ 'admin.pool.themes.tracks' | translate: { count: theme.trackCount } }}</span>
              <button type="button" class="text-sm underline disabled:opacity-40 disabled:no-underline" style="color:var(--text-error)"
                [disabled]="theme.trackCount > 0" (click)="remove.emit(theme.id)" data-testid="theme-delete">
                {{ 'admin.pool.themes.delete' | translate }}
              </button>
            </li>
          } @empty {
            <li class="text-xs" style="color:var(--text-muted)">{{ 'admin.pool.themes.empty' | translate }}</li>
          }
        </ul>
        <form class="flex items-center gap-2" (submit)="submit($event)">
          <input type="text" class="app-input flex-1" [value]="draft()" [attr.maxlength]="maxLength" (input)="draft.set(valueOf($event))"
            [attr.aria-label]="'admin.pool.themes.newName' | translate" [placeholder]="'admin.pool.themes.newName' | translate" data-testid="theme-new" />
          <button type="submit" class="text-sm font-medium py-2 px-4 rounded-lg disabled:opacity-50" style="background:var(--bg-primary);color:var(--text-on-primary)"
            [disabled]="!draft().trim()">{{ 'admin.pool.themes.add' | translate }}</button>
        </form>
        @if (errorKey(); as key) {
          <p role="alert" class="text-xs" style="color:var(--text-error)" data-testid="themes-error">{{ key | translate }}</p>
        }
      </div>
    </details>
  `,
})
export class PoolThemesComponent {
  readonly themes = input.required<readonly PoolTheme[]>();
  /** La clé de traduction de la dernière erreur (nom pris, thème utilisé), vide sinon. */
  readonly errorKey = input<string | null>(null);
  readonly add = output<string>();
  readonly rename = output<{ id: number; name: string }>();
  readonly remove = output<number>();

  protected readonly maxLength = THEME_MAX_LENGTH;
  protected readonly draft = signal('');

  protected valueOf(event: Event): string {
    return (event.target as HTMLInputElement).value;
  }

  protected nameOf(event: Event): string {
    return this.valueOf(event).trim();
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const name = this.draft().trim();
    if (!name) return;
    this.add.emit(name);
    this.draft.set('');
  }
}
