import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, output } from '@angular/core';
import { FormField, form, max, min, required } from '@angular/forms/signals';
import { TranslatePipe } from '@ngx-translate/core';
import {
  COOLDOWN_ALERT_DAYS, COOLDOWN_MAX_PERCENT, COOLDOWN_MIN_PERCENT, CooldownSettings, isValidCooldownPercent,
  cooldownTone,
} from '../../../domain/cooldown';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

const DAYS_COLOR = { low: 'var(--color-fail)', medium: 'var(--color-warn)', high: 'var(--text-hi)' } as const;

/**
 * Le cooldown de réutilisation des morceaux (#275), replié en une ligne en tête de l'onglet Morceaux (« Cooldown : 120 j (75 % du
 * catalogue) ⚙ ») : les jours, colorés sous le seuil d'alerte. Déplié, la part du pool en cooldown (de 10 à 90 %), qui repart de la
 * valeur de l'API et s'y recale après chaque enregistrement, le pool jouable sur lequel elle s'applique, et un avertissement sous le
 * seuil de 14 jours. Le bouton n'envoie qu'une valeur valide.
 */
@Component({
  selector: 'app-pool-cooldown',
  imports: [FormField, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <details class="group rounded-xl px-4 py-2.5" style="background:var(--bg-surface)" data-testid="cooldown-setting">
      <summary class="list-none [&::-webkit-details-marker]:hidden cursor-pointer flex items-center justify-between gap-3 text-sm" style="color:var(--text-muted)">
        @if (cooldown(); as applied) {
          <span>{{ 'admin.pool.cooldownSetting.label' | translate }}
            <span class="font-semibold" [style.color]="daysColor()" data-testid="cooldown-days">{{ 'admin.pool.cooldownSetting.days' | translate: { days: applied.days } }}</span>
            {{ 'admin.pool.cooldownSetting.share' | translate: { percent: applied.poolPercent } }}</span>
        } @else {
          <span>{{ 'admin.pool.cooldownSetting.label' | translate }} -</span>
        }
        <span aria-hidden="true" class="transition-transform group-open:rotate-90">⚙</span>
      </summary>
      <div class="flex flex-col gap-2 pt-3">
      <div class="flex flex-wrap items-center gap-3">
        <label for="track-cooldown-percent-input" class="text-sm" style="color:var(--text-light)">{{ 'admin.pool.cooldownSetting.cooldownPercent' | translate }}</label>
        <span class="flex items-center gap-1">
          <input id="track-cooldown-percent-input" type="number" inputmode="numeric" [formField]="cooldownForm.percent"
            class="w-20 text-sm rounded-lg px-3 py-1.5 outline-none"
            style="background:var(--bg-inactive);color:var(--text-hi)" />
          <span class="text-sm" style="color:var(--text-light)">%</span>
        </span>
        <button type="button" (click)="save()" [disabled]="saveDisabled()"
          class="text-sm font-medium py-2 px-4 rounded-lg transition-colors disabled:opacity-50"
          style="background:var(--bg-primary);color:var(--text-on-primary)">
          {{ 'admin.pool.cooldownSetting.saveCooldown' | translate }}
        </button>
        @if (status() === 'saved') { <span class="text-xs" role="status" style="color:var(--color-success)">{{ 'admin.pool.cooldownSetting.cooldownSaved' | translate }}</span> }
        @if (status() === 'error') { <span class="text-xs" role="status" style="color:var(--text-error)">{{ 'admin.pool.cooldownSetting.cooldownError' | translate }}</span> }
      </div>
      @if (cooldownForm().invalid() && cooldownForm.percent().touched()) {
        <p class="text-xs" style="color:var(--text-error)">{{ 'admin.pool.cooldownSetting.cooldownInvalid' | translate: { min: minPercent, max: maxPercent } }}</p>
      }
      @if (cooldown(); as applied) {
        <p class="text-xs" data-testid="cooldown-applied" style="color:var(--text-muted)">
          {{ (applied.days > 1 ? 'admin.pool.cooldownSetting.cooldownAppliedDays' : 'admin.pool.cooldownSetting.cooldownAppliedDay')
            | translate: { days: applied.days, count: applied.playableCount } }}
        </p>
        @if (belowAlert()) {
          <p class="text-xs" role="alert" style="color:var(--color-warn)">{{ 'admin.pool.cooldownSetting.cooldownBelowAlert' | translate: { days: alertDays } }}</p>
        }
      }
      </div>
    </details>
  `,
})
export class PoolCooldownComponent {
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

  protected readonly daysColor = computed(() => {
    const applied = this.cooldown();
    return applied ? DAYS_COLOR[cooldownTone(applied.days)] : null;
  });

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
