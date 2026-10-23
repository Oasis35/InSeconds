import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { ArchiveDay, formatGameDate } from '../../domain/archive';

/**
 * L'encart « Les réponses d'hier » de l'écran « déjà joué » : les pochettes du défi d'hier et sa date, vers la page du jour ; la médiane
 * seulement à partir du seuil de joueurs. Rien ne laisse croire qu'on rejoue : on y lit des réponses.
 */
@Component({
  selector: 'app-yesterday-answers-card',
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a [routerLink]="link()" data-testid="yesterday-answers"
       class="w-full flex items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
       style="background:var(--bg-surface);border:1px solid var(--border-medium);border-radius:var(--radius-card)">
      <span class="flex-1 min-w-0 flex flex-col gap-2">
        <span class="text-[15px] font-semibold" style="color:var(--text-hi)">
          {{ 'daily.archive.yesterdayAnswers' | translate }} <span class="text-[13px] whitespace-nowrap" style="color:var(--text-faint);font-weight:400">· {{ dateLabel() }}</span>
        </span>
        <span class="flex items-center gap-3">
          <span class="flex">
            @for (t of day().tracks; track t.position) {
              @if (t.coverUrl) {
                <img [src]="t.coverUrl" alt="" class="w-[26px] h-[26px] rounded-full object-cover" style="border:2px solid var(--bg-surface)"
                     [style.margin-left.px]="$first ? 0 : -7" loading="lazy" />
              } @else {
                <span class="w-[26px] h-[26px] rounded-full" style="background:var(--bg-surface-2);border:2px solid var(--bg-surface)"
                      [style.margin-left.px]="$first ? 0 : -7"></span>
              }
            }
          </span>
          @if (day().hasStats) {
            <span class="text-sm" style="color:var(--text-muted)" data-testid="yesterday-median">
              {{ 'daily.archive.median' | translate }}
              <b style="font-family:var(--font-display);color:var(--color-violet)">{{ day().medianScore }}</b>
            </span>
          }
        </span>
      </span>
      <span class="text-xl shrink-0" style="color:var(--text-faint)" aria-hidden="true">›</span>
    </a>
  `,
})
export class YesterdayAnswersCardComponent {
  readonly day = input.required<ArchiveDay>();
  readonly lang = input<'fr' | 'en'>('fr');

  protected readonly link = computed(() => ['/daily/archive', this.day().date]);
  protected readonly dateLabel = computed(() => formatGameDate(this.day().date, this.lang(), 'weekday'));
}
