import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { RunLevel } from '../../domain/run';

/** L'alerte ne s'affiche qu'à partir de cette échéance : une semaine avant que l'inactivité ne fasse perdre le disque. */
export const INACTIVITY_ALERT_DAYS = 7;

/** L'alerte est-elle à montrer pour ce niveau ? */
export const showsInactivityAlert = (level: RunLevel | null): boolean =>
  level?.discDropInDays !== null && level?.discDropInDays !== undefined && level.discDropInDays <= INACTIVITY_ALERT_DAYS;

/**
 * L'alerte d'inactivité de l'accueil, au-dessus de la carte Survie : « Ton disque d'argent baisse dans 3 jours ». Cyan (le temps), en contour simple,
 * sans lueur : elle n'est jamais la tuile de focus de l'écran. Rien quand le disque n'est pas menacé dans la semaine.
 */
@Component({
  selector: 'app-run-inactivity-alert',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'block' },
  template: `
    @if (days(); as days) {
      <section class="rounded-(--radius-card) px-5 py-3.5 flex flex-col gap-1" role="status" data-testid="run-inactivity-alert"
        style="background:var(--bg-surface);border:1px solid rgb(var(--rgb-accent-2) / 0.7)">
        <p class="text-base font-bold leading-snug" style="color:var(--color-accent-2)" data-testid="run-inactivity-title">
          {{ (days === 1 ? 'runs.inactivity.titleTomorrow' : 'runs.inactivity.title') | translate: { disc: lower(level()!.disc.key | translate), days: days } }}
        </p>
        <p class="text-sm leading-snug" style="color:var(--text-light)">{{ 'runs.inactivity.body' | translate }}</p>
      </section>
    }
  `,
})
export class RunInactivityAlertComponent {
  /** Le niveau du joueur ; `null` sans niveau. */
  readonly level = input<RunLevel | null>(null);

  protected readonly days = computed(() => (showsInactivityAlert(this.level()) ? this.level()!.discDropInDays : null));

  /** « disque d'argent » : le nom d'un disque au milieu d'une phrase. */
  protected lower(text: string): string {
    return text.charAt(0).toLowerCase() + text.slice(1);
  }
}
