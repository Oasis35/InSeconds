import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { PillState } from '../../domain/run';

const COLORS: Readonly<Record<PillState, string>> = {
  found: 'var(--color-success)',
  half: 'var(--color-warn)',
  missed: 'rgb(var(--rgb-danger) / 0.45)',
  neutralized: 'transparent',
  current: 'var(--color-accent-3)',
  todo: 'var(--bg-inactive)',
};

/** Les pastilles d'une manche (une par morceau) et « Morceau 3 sur 5 » : vert trouvé, ambre à moitié, corail en cours, hachuré retiré. */
@Component({
  selector: 'app-run-pills',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col items-center gap-2">
      <div class="flex items-center gap-2" data-testid="run-pills">
        @for (pill of pills(); track $index) {
          <span class="h-1.5 w-12 rounded-full" [attr.data-state]="pill" [style.background]="color(pill)"
            [style.border]="pill === 'neutralized' ? '1px dashed var(--text-faint)' : null"></span>
        }
      </div>
      <p class="text-sm" style="color:var(--text-muted)" data-testid="run-position">
        {{ 'runs.pills.position' | translate: { position: position(), total: pills().length } }}
      </p>
    </div>
  `,
})
export class RunPillsComponent {
  readonly pills = input.required<readonly PillState[]>();
  /** Le morceau affiché dans la manche, à partir de 1. */
  readonly position = input.required<number>();

  protected color(pill: PillState): string {
    return COLORS[pill];
  }
}
