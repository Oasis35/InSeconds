import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output } from '@angular/core';
import { FormField, form, max, min, required } from '@angular/forms/signals';
import { TranslatePipe } from '@ngx-translate/core';
import { COOLDOWN_MAX_DAYS, COOLDOWN_MIN_DAYS, isValidCooldownDays } from '../domain/actions';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Bloc « Cooldown de réutilisation des morceaux » : le champ (en jours, de 1 à 3650) repart de la
 * valeur de l'API et s'y recale après chaque enregistrement ; le bouton n'envoie que une valeur valide.
 */
@Component({
  selector: 'app-action-cooldown',
  imports: [FormField, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-2">
      <h2 class="text-xs font-semibold uppercase tracking-wide" style="color:var(--text-muted)">{{ 'admin.actions.trackCooldown' | translate }}</h2>
      <div class="flex items-center gap-3">
        <label for="track-cooldown-days-input" class="sr-only">{{ 'admin.actions.trackCooldown' | translate }}</label>
        <input id="track-cooldown-days-input" type="number" [formField]="cooldownForm.days"
          class="w-20 text-sm rounded-lg px-3 py-1.5 outline-none"
          style="background:var(--bg-inactive);color:var(--text-hi)" />
        <button type="button" (click)="save()" [disabled]="saveDisabled()"
          class="text-sm font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
          style="background:var(--bg-primary);color:var(--text-on-primary)">
          {{ 'admin.actions.saveCooldown' | translate }}
        </button>
        @if (status() === 'saved') { <span class="text-xs" role="status" style="color:var(--color-success)">{{ 'admin.actions.cooldownSaved' | translate }}</span> }
        @if (status() === 'error') { <span class="text-xs" role="status" style="color:var(--text-error)">{{ 'admin.actions.cooldownError' | translate }}</span> }
      </div>
      @if (cooldownForm().invalid() && cooldownForm.days().touched()) {
        <p class="text-xs" style="color:var(--text-error)">{{ 'admin.actions.cooldownInvalid' | translate: { min: minDays, max: maxDays } }}</p>
      }
    </div>
  `,
})
export class ActionCooldownComponent {
  /** Le délai connu de l'API ; `null` tant qu'il n'est pas lu. */
  readonly days = input<number | null>(null);
  readonly status = input<SaveStatus>('idle');
  readonly saveDays = output<number>();

  protected readonly minDays = COOLDOWN_MIN_DAYS;
  protected readonly maxDays = COOLDOWN_MAX_DAYS;

  protected readonly cooldownForm = form(
    linkedSignal(() => ({ days: this.days() as number | null })),
    path => {
      required(path.days);
      min(path.days, COOLDOWN_MIN_DAYS);
      max(path.days, COOLDOWN_MAX_DAYS);
    },
  );

  protected readonly saveDisabled = computed(
    () => this.cooldownForm().invalid() || !isValidCooldownDays(this.cooldownForm.days().value()) || this.status() === 'saving',
  );

  protected save(): void {
    const value = this.cooldownForm.days().value();
    if (!this.saveDisabled() && isValidCooldownDays(value)) this.saveDays.emit(value);
  }
}
