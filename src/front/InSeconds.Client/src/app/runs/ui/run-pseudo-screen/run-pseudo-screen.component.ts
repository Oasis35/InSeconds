import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { BrandComponent } from '../../../gameplay/ui/brand/brand.component';
import { ButtonComponent } from '../../../ui/button/button.component';

/**
 * Le pseudo d'un invité, demandé une seule fois (à la fin de sa première partie sur la playlist d'un ami, avant la comparaison) et retrouvé à chaque
 * visite par ce navigateur : il s'affiche à côté de son score dans la comparaison de la playlist. Obligatoire la première fois (pas de « Passer »),
 * modifiable ensuite par le crayon de la comparaison. Le contrôle de la saisie et l'enregistrement sont ceux du store (`error` dit le refus).
 */
@Component({
  selector: 'app-run-pseudo-screen',
  imports: [TranslatePipe, BrandComponent, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex-1 flex flex-col' },
  template: `
    <app-brand [homeLink]="true" />
    <form class="screen-enter flex-1 flex flex-col justify-center gap-4 py-6" data-testid="run-pseudo" (submit)="$event.preventDefault(); submit()">
      <div class="space-y-1">
        <h1 class="text-2xl font-extrabold" style="font-family:var(--font-display);color:var(--text-hi)">
          {{ (editing() ? 'runs.pseudo.titleEdit' : 'runs.pseudo.title') | translate }}
        </h1>
        <p class="text-sm" style="color:var(--text-light)">{{ 'runs.pseudo.subtitle' | translate }}</p>
      </div>
      <label class="block space-y-1.5">
        <span class="text-xs font-semibold" style="color:var(--text-muted)">{{ 'runs.pseudo.label' | translate }}</span>
        <input type="text" autocomplete="nickname" autocapitalize="words" spellcheck="false" maxlength="20" data-testid="run-pseudo-input"
          class="w-full rounded-(--radius-button) px-4 py-3 text-base"
          style="background:var(--bg-input);border:1px solid var(--border-medium);color:var(--text-hi)"
          [value]="value()" [attr.aria-invalid]="error() ? 'true' : null"
          (input)="typed.set($any($event.target).value)" />
        @if (error(); as key) {
          <span class="block text-sm" style="color:var(--color-wrong)" role="alert" data-testid="run-pseudo-error">{{ key | translate }}</span>
        } @else {
          <span class="block text-xs" style="color:var(--text-muted)">{{ 'runs.pseudo.hint' | translate }}</span>
        }
      </label>
      <button appButton variant="primary" size="lg" [block]="true" type="submit" [disabled]="busy()" data-testid="run-pseudo-save">
        {{ 'runs.pseudo.save' | translate }}
      </button>
      @if (editing()) {
        <button type="button" class="text-sm underline self-center py-3 px-4" style="color:var(--text-muted)" data-testid="run-pseudo-cancel" (click)="cancel.emit()">
          {{ 'runs.pseudo.cancel' | translate }}
        </button>
      }
    </form>
  `,
})
export class RunPseudoScreenComponent {
  /** Le pseudo déjà donné (modification) ; vide la première fois. */
  readonly initial = input('');
  readonly busy = input(false);
  /** La clé de traduction du refus de la dernière saisie, `null` sans refus. */
  readonly error = input<string | null>(null);
  readonly save = output<string>();
  readonly cancel = output();

  protected readonly typed = signal<string | null>(null);
  protected readonly editing = computed(() => this.initial() !== '');
  protected readonly value = computed(() => this.typed() ?? this.initial());

  protected submit(): void {
    if (!this.busy()) this.save.emit(this.value());
  }
}
