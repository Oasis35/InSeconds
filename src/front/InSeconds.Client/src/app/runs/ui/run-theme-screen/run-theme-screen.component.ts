import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { BrandComponent } from '../../../gameplay/ui/brand/brand.component';
import { ButtonComponent } from '../../../ui/button/button.component';
import { ThemeIconComponent } from '../../../ui/theme-icon/theme-icon.component';
import { RunThemeOffer } from '../../domain/run';

/**
 * Le choix du thème, au lancement d'une playlist : le créateur choisit le thème de la manche à thème parmi deux thèmes tirés au hasard, ou
 * « Surprise » (le serveur tire). Ses amis jouent la même playlist, sans choix. « Lancer » est le clic qui lance le premier son (iPhone).
 */
@Component({
  selector: 'app-run-theme-screen',
  imports: [TranslatePipe, BrandComponent, ButtonComponent, ThemeIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex-1 flex flex-col' },
  template: `
    <app-brand [homeLink]="true" />
    <div class="screen-enter flex-1 flex flex-col justify-center gap-4 py-6" data-testid="run-theme">
      <div class="space-y-1">
        <h1 class="text-2xl font-extrabold" style="font-family:var(--font-display);color:var(--text-hi)">{{ 'runs.theme.title' | translate }}</h1>
        <p class="text-sm" style="color:var(--text-light)">{{ 'runs.theme.subtitle' | translate: { round: round() } }}</p>
      </div>
      <div role="radiogroup" [attr.aria-label]="'runs.theme.title' | translate" class="flex flex-col gap-3">
        @for (theme of offer(); track theme.id) {
          <button type="button" role="radio" class="theme-tile" [attr.aria-checked]="choice() === theme.id" [attr.data-theme-id]="theme.id"
            (click)="choose.emit(theme.id)">
            @if (hasIcons()) {
              <span class="theme-icon">@if (theme.icon) { <app-theme-icon [name]="theme.icon" [size]="26" /> }</span>
            }
            <span class="flex-1 text-left">
              <span class="block text-[1.0625rem] font-bold" style="color:var(--text-hi)">{{ theme.name }}</span>
              <span class="block text-xs mt-0.5" style="color:var(--text-muted)">{{ 'runs.theme.tracks' | translate }}</span>
            </span>
            <span class="theme-radio" aria-hidden="true"></span>
          </button>
        }
        <button type="button" role="radio" class="theme-tile" [attr.aria-checked]="choice() === null" data-theme-id="surprise" (click)="choose.emit(null)">
          @if (hasIcons()) {
            <span class="theme-icon"></span>
          }
          <span class="flex-1 text-left">
            <span class="block text-[1.0625rem] font-bold" style="color:var(--text-hi)">{{ 'runs.theme.surprise' | translate }}</span>
            <span class="block text-xs mt-0.5" style="color:var(--text-muted)">{{ 'runs.theme.surpriseHint' | translate }}</span>
          </span>
          <span class="theme-radio" aria-hidden="true"></span>
        </button>
      </div>
      <p class="text-xs text-center" style="color:var(--text-muted)">{{ 'runs.theme.friends' | translate }}</p>
      <button appButton type="button" size="lg" [block]="true" (click)="start.emit()" data-testid="run-theme-start">
        {{ 'runs.theme.launch' | translate }}
      </button>
    </div>
  `,
  styles: `
    .theme-tile {
      display: flex; align-items: center; gap: 0.75rem; padding: 0.875rem 1rem; border-radius: var(--radius-card);
      border: 1px solid var(--border-neutral); background: rgb(var(--rgb-surface) / 0.55);
    }
    .theme-tile[aria-checked='true'] { border-color: var(--color-accent); background: rgb(var(--rgb-accent) / 0.08); }
    .theme-icon { width: 26px; flex: none; display: inline-flex; color: var(--text-light); }
    .theme-tile[aria-checked='true'] .theme-icon { color: var(--color-accent); }
    .theme-radio {
      width: 1.25rem; height: 1.25rem; border-radius: 50%; border: 1.5px solid var(--border-neutral); flex: none;
      display: grid; place-items: center;
    }
    .theme-tile[aria-checked='true'] .theme-radio { border-color: var(--color-accent); }
    .theme-tile[aria-checked='true'] .theme-radio::after { content: ''; width: 0.625rem; height: 0.625rem; border-radius: 50%; background: var(--color-accent); }
  `,
})
export class RunThemeScreenComponent {
  /** Les thèmes proposés. */
  readonly offer = input.required<readonly RunThemeOffer[]>();
  /** Le thème choisi ; `null` : « Surprise ». */
  readonly choice = input<number | null>(null);
  /** La manche qui aura ce thème. */
  readonly round = input(3);
  protected readonly hasIcons = computed(() => this.offer().some(theme => theme.icon));
  readonly choose = output<number | null>();
  readonly start = output();
}
