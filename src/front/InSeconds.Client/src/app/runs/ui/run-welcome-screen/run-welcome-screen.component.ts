import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { RunLevel, RunRecord } from '../../domain/run';
import { ButtonComponent } from '../../../ui/button/button.component';
import { RunLevelCardComponent } from '../run-level-card/run-level-card.component';

/**
 * L'accueil du mode : le nom, « accès anticipé », la promesse, le record du joueur s'il en a un, puis « Lancer une partie » (une playlist neuve ; une partie en cours passe par l'écran de reprise). Le clic sur ce bouton est le geste qui
 * déverrouille le son. Dans la nouvelle interface, la carte du niveau (disque, points, ce qui manque pour le suivant) la précède.
 */
@Component({
  selector: 'app-run-welcome-screen',
  imports: [TranslatePipe, ButtonComponent, RunLevelCardComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (overlay()) {
      <div class="screen-enter w-full max-w-xs flex flex-col items-center gap-4" data-testid="run-welcome">
        <button appButton type="button" size="lg" [block]="true" (click)="start.emit()" data-testid="run-start">{{ 'runs.welcome.begin' | translate }}</button>
        @if (level(); as level) {
          <app-run-level-card class="w-full text-left" [level]="level" [lang]="lang()" [focus]="false" />
        }
        @if (record(); as best) {
          <p class="text-sm" style="color:var(--color-accent-3)" data-testid="run-record">{{ 'runs.welcome.record' | translate: { score: format(best.bestScore) } }}</p>
        }
      </div>
    } @else {
      <div class="screen-enter flex-1 flex flex-col items-center justify-center gap-6 text-center px-4" data-testid="run-welcome">
        <div class="space-y-3">
          <span class="inline-block px-3 py-1 rounded-full text-[0.8125rem] font-bold"
            style="color:var(--color-accent);background:rgb(var(--rgb-accent) / 0.14)">{{ 'runs.welcome.badge' | translate }}</span>
          <h1 class="text-3xl font-extrabold" style="font-family:var(--font-display);color:var(--text-hi)">{{ 'runs.welcome.title' | translate }}</h1>
          <p class="text-base" style="color:var(--text-light)">{{ 'runs.welcome.tagline' | translate }}</p>
          @if (record(); as best) {
            <p class="text-sm" style="color:var(--color-accent-3)" data-testid="run-record">
              {{ 'runs.welcome.record' | translate: { score: format(best.bestScore) } }}
            </p>
          }
        </div>
        @if (level(); as level) {
          <app-run-level-card class="w-full max-w-xs text-left" [level]="level" [lang]="lang()" [focus]="false" />
        }
        <button appButton type="button" size="lg" [block]="true" class="max-w-xs" (click)="start.emit()" data-testid="run-start">
          {{ 'runs.welcome.launch' | translate }}
        </button>
      </div>
    }
  `,
})
export class RunWelcomeScreenComponent {
  readonly record = input<RunRecord | null>(null);
  /** La langue de l'interface : les nombres s'écrivent à sa façon. */
  readonly lang = input<'fr' | 'en'>('fr');
  /** Le niveau du joueur (nouvelle interface) ; `null` : pas de carte de niveau. */
  readonly level = input<RunLevel | null>(null);
  private readonly numbers = computed(() => new Intl.NumberFormat(this.lang()));
  /** Nouvelle interface : la carte de départ (« Commencer », niveau, record) se pose sur le jeu flou que dessine la page, au lieu d'être un accueil à part. */
  readonly overlay = input(false);
  readonly start = output();

  /** « 2 617 » : les grands nombres au format de la langue. */
  protected format(value: number): string {
    return this.numbers().format(value);
  }
}
