import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { ChallengeHistoryEntry } from '../domain/challenge';

/** L'historique : une ligne par défi (la date, puis ses morceaux). Purement présentationnel. */
@Component({
  selector: 'app-challenge-history',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="flex flex-col">
      @for (c of challenges(); track c.id) {
        <li class="py-3" style="border-top:1px solid var(--border-medium)">
          <p class="font-mono text-sm mb-1" style="color:var(--text-hi)">{{ c.date }}</p>
          <ul class="flex flex-col gap-0.5">
            @for (t of c.tracks; track t.position) {
              <li class="text-xs" style="color:var(--text-muted)">{{ t.position }}. {{ t.artist }} — {{ t.title }}</li>
            }
          </ul>
        </li>
      }
    </ul>
  `,
})
export class ChallengeHistoryComponent {
  readonly challenges = input.required<readonly ChallengeHistoryEntry[]>();
}
