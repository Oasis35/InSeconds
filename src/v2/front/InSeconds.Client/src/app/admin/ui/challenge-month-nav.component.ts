import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';

/** Le navigateur de mois ‹ Mois Année › de l'onglet Défis (partagé entre « Stats par défi » et « Historique »). */
@Component({
  selector: 'app-challenge-month-nav',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex items-center justify-center gap-2">
      <button type="button" (click)="previous.emit()" [disabled]="!canPrevious()"
        [attr.aria-label]="'admin.challenges.previousMonth' | translate"
        class="w-7 h-7 flex items-center justify-center rounded-lg transition-colors text-sm disabled:opacity-30 disabled:cursor-not-allowed"
        style="background:var(--bg-inactive);color:var(--text-hi)">‹</button>
      <span class="text-sm font-medium w-36 text-center" style="color:var(--text-hi)" data-testid="challenge-month">{{ label() }}</span>
      <button type="button" (click)="next.emit()" [disabled]="!canNext()"
        [attr.aria-label]="'admin.challenges.nextMonth' | translate"
        class="w-7 h-7 flex items-center justify-center rounded-lg transition-colors text-sm disabled:opacity-30 disabled:cursor-not-allowed"
        style="background:var(--bg-inactive);color:var(--text-hi)">›</button>
    </div>
  `,
})
export class ChallengeMonthNavComponent {
  /** Le mois en toutes lettres (« Octobre 2026 »). */
  readonly label = input.required<string>();
  readonly canPrevious = input(false);
  readonly canNext = input(false);
  readonly previous = output<void>();
  readonly next = output<void>();
}
