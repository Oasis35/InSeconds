import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output } from '@angular/core';
import { FormField, form, max, min, required } from '@angular/forms/signals';
import { TranslatePipe } from '@ngx-translate/core';
import {
  COOLDOWN_ALERT_DAYS, COOLDOWN_MAX_PERCENT, COOLDOWN_MIN_PERCENT, CooldownSettings, isValidCooldownPercent,
} from '../domain/actions';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/**
 * Bloc « Cooldown de réutilisation des morceaux » (#275) : la part du pool en cooldown (de 10 à 90 %), qui repart de la
 * valeur de l'API et s'y recale après chaque enregistrement, les jours qu'elle donne sur le pool d'aujourd'hui, et un
 * avertissement sous le seuil de 14 jours. Le bouton n'envoie qu'une valeur valide.
 */
@Component({
  selector: 'app-action-cooldown',
  imports: [FormField, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-2">
      <h2 class="text-xs font-semibold uppercase tracking-wide" style="color:var(--text-muted)">{{ 'admin.actions.trackCooldown' | translate }}</h2>
      <div class="flex flex-wrap items-center gap-3">
        <label for="track-cooldown-percent-input" class="text-sm" style="color:var(--text-light)">{{ 'admin.actions.cooldownPercent' | translate }}</label>
        <span class="flex items-center gap-1">
          <input id="track-cooldown-percent-input" type="number" inputmode="numeric" [formField]="cooldownForm.percent"
            class="w-20 text-sm rounded-lg px-3 py-1.5 outline-none"
            style="background:var(--bg-inactive);color:var(--text-hi)" />
          <span class="text-sm" style="color:var(--text-light)">%</span>
        </span>
        <button type="button" (click)="save()" [disabled]="saveDisabled()"
          class="text-sm font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
          style="background:var(--bg-primary);color:var(--text-on-primary)">
          {{ 'admin.actions.saveCooldown' | translate }}
        </button>
        @if (status() === 'saved') { <span class="text-xs" role="status" style="color:var(--color-success)">{{ 'admin.actions.cooldownSaved' | translate }}</span> }
        @if (status() === 'error') { <span class="text-xs" role="status" style="color:var(--text-error)">{{ 'admin.actions.cooldownError' | translate }}</span> }
      </div>
      @if (cooldownForm().invalid() && cooldownForm.percent().touched()) {
        <p class="text-xs" style="color:var(--text-error)">{{ 'admin.actions.cooldownInvalid' | translate: { min: minPercent, max: maxPercent } }}</p>
      }
      @if (cooldown(); as applied) {
        <p class="text-xs" data-testid="cooldown-applied" style="color:var(--text-muted)">
          {{ (applied.days > 1 ? 'admin.actions.cooldownAppliedDays' : 'admin.actions.cooldownAppliedDay')
            | translate: { days: applied.days, count: applied.playableCount } }}
        </p>
        @if (belowAlert()) {
          <p class="text-xs" role="alert" style="color:var(--color-warn)">{{ 'admin.actions.cooldownBelowAlert' | translate: { days: alertDays } }}</p>
        }
      }
    </div>
  `,
})
export class ActionCooldownComponent {
  /** Le cooldown connu de l'API ; `null` tant qu'il n'est pas lu. */
  readonly cooldown = input<CooldownSettings | null>(null);
  readonly status = input<SaveStatus>('idle');
  readonly savePercent = output<number>();

  protected readonly minPercent = COOLDOWN_MIN_PERCENT;
  protected readonly maxPercent = COOLDOWN_MAX_PERCENT;
  protected readonly alertDays = COOLDOWN_ALERT_DAYS;

  protected readonly cooldownForm = form(
    linkedSignal(() => ({ percent: this.cooldown()?.poolPercent ?? null })),
    path => {
      required(path.percent);
      min(path.percent, COOLDOWN_MIN_PERCENT);
      max(path.percent, COOLDOWN_MAX_PERCENT);
    },
  );

  /** Le cooldown appliqué est sous le seuil d'alerte : un morceau revient trop vite, il faut agrandir le pool. */
  protected readonly belowAlert = computed(() => (this.cooldown()?.days ?? COOLDOWN_ALERT_DAYS) < COOLDOWN_ALERT_DAYS);

  protected readonly saveDisabled = computed(
    () => this.cooldownForm().invalid() || !isValidCooldownPercent(this.cooldownForm.percent().value()) || this.status() === 'saving',
  );

  protected save(): void {
    const value = this.cooldownForm.percent().value();
    if (!this.saveDisabled() && isValidCooldownPercent(value)) this.savePercent.emit(value);
  }
}
