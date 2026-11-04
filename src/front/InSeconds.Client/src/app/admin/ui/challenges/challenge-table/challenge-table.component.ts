import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ChallengeStats, accountPlayerCount, formatDay, guestPlayerCount, unfinishedCount } from '../../../domain/challenge';

/**
 * Les défis du mois en tableau (onglet Défis, PC) : date, joueurs (tous ceux qui ont commencé), dont comptes et invités, parties
 * finies, abandons et inachevées, médiane (violet : les autres joueurs). Une ligne se sélectionne au clic (ou au clavier) ; son détail
 * s'affiche à côté.
 */
@Component({
  selector: 'app-challenge-table',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <table class="w-full text-sm" data-testid="challenge-table">
      <thead>
        <tr class="text-left text-xs" style="color:var(--text-muted);border-bottom:1px solid var(--border-medium)">
          <th class="py-2 pr-2 font-medium">{{ 'admin.challenges.colDate' | translate }}</th>
          <th class="py-2 px-2 text-right font-medium">{{ 'admin.challenges.colPlayers' | translate }}</th>
          <th class="py-2 px-2 text-right font-medium">{{ 'admin.challenges.colAccounts' | translate }}</th>
          <th class="py-2 px-2 text-right font-medium">{{ 'admin.challenges.colGuests' | translate }}</th>
          <th class="py-2 px-2 text-right font-medium">{{ 'admin.challenges.colCompleted' | translate }}</th>
          <th class="py-2 px-2 text-right font-medium">{{ 'admin.challenges.colAbandons' | translate }}</th>
          <th class="py-2 pl-2 text-right font-medium">{{ 'admin.challenges.colMedian' | translate }}</th>
        </tr>
      </thead>
      <tbody>
        @for (c of challenges(); track c.id) {
          @let selected = selectedId() === c.id;
          <tr (click)="selectChallenge.emit(c.id)" class="cursor-pointer hover:bg-(--bg-inactive)" data-testid="challenge-table-row"
            style="border-bottom:1px solid var(--border-subtle)" [style.background]="selected ? 'var(--bg-inactive)' : null"
            [attr.aria-selected]="selected">
            <td class="py-2 pr-2">
              <button type="button" class="font-mono text-left" [style.color]="selected ? 'var(--text-hi)' : 'var(--text-body)'"
                (click)="$event.stopPropagation(); selectChallenge.emit(c.id)">{{ day(c.date) }}</button>
            </td>
            <td class="py-2 px-2 text-right tabular-nums" style="color:var(--text-hi)">{{ c.players.length }}</td>
            <td class="py-2 px-2 text-right tabular-nums" style="color:var(--text-body)">{{ accounts(c) }}</td>
            <td class="py-2 px-2 text-right tabular-nums" style="color:var(--text-body)">{{ guests(c) }}</td>
            <td class="py-2 px-2 text-right tabular-nums" style="color:var(--text-body)">{{ c.playerCount }}</td>
            <td class="py-2 px-2 text-right tabular-nums" [style.color]="unfinished(c) > 0 ? 'var(--color-warn)' : 'var(--text-faint)'">{{ unfinished(c) }}</td>
            <td class="py-2 pl-2 text-right tabular-nums" style="color:var(--color-violet)">{{ c.scoreMedian ?? '-' }}</td>
          </tr>
        }
      </tbody>
    </table>
  `,
})
export class ChallengeTableComponent {
  readonly challenges = input.required<readonly ChallengeStats[]>();
  readonly selectedId = input<number | null>(null);
  readonly selectChallenge = output<number>();

  protected readonly unfinished = unfinishedCount;
  protected readonly accounts = accountPlayerCount;
  protected readonly guests = guestPlayerCount;
  protected readonly day = formatDay;
}
