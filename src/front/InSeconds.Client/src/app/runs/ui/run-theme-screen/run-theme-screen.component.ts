import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, input, output, signal, untracked } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { motionReduced } from '../../../ui/motion/reduced-motion';
import { ThemeIconComponent } from '../../../ui/theme-icon/theme-icon.component';
import { RunThemeChoice } from '../../domain/run';

/** Les lettres du tirage : seulement du décor, le thème retenu vient du serveur. */
const SCRAMBLE_LETTERS = 'ABCDEFGHIJKLMNOPRSTUVY';
/** Le tirage « mouline » une seconde et demie environ, de plus en plus lentement, puis s'arrête sur le thème retenu. */
const ROLL_STEPS = 10;
const rollGap = (step: number): number => 60 + step * step * 3;
/** Le temps de lire le thème retenu avant que la manche suive. */
const HOLD_MYSTERY_MS = 1000;
const HOLD_CHOSEN_MS = 250;

/**
 * Le choix du thème, juste avant la manche à thème (le créateur de la playlist seulement) : deux thèmes et « Thème mystère », un autre thème tiré
 * au sort. Un toucher envoie le choix ; pour le thème mystère, le nom défile le temps du tirage (décor, le serveur répond tout de suite) puis
 * s'arrête sur le thème retenu, les autres lignes s'éteignent ; la page enchaîne ensuite (`revealed`). Violet : le tirage au sort, orange : le choix
 * du joueur. Rien en mouvement réduit.
 */
@Component({
  selector: 'app-run-theme-screen',
  imports: [TranslatePipe, ThemeIconComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'flex-1 flex flex-col' },
  template: `
    <div class="flex-1 flex flex-col justify-center gap-4 py-6" data-testid="run-theme">
      <div class="space-y-1">
        <h1 class="text-2xl font-extrabold" style="font-family:var(--font-display);color:var(--text-hi)">{{ 'runs.theme.title' | translate }}</h1>
        <p class="text-sm" style="color:var(--text-light)">{{ 'runs.theme.subtitle' | translate: { round: choice().round } }}</p>
      </div>
      <div class="flex flex-col gap-3">
        @for (theme of choice().themes; track theme.id) {
          <button type="button" class="theme-tile" [class.dim]="picked() !== null && picked() !== theme.id" [class.picked]="picked() === theme.id"
            [disabled]="picked() !== null" [attr.data-theme-id]="theme.id" (click)="choose.emit(theme.id)">
            @if (hasIcons()) {
              <span class="theme-icon">@if (theme.icon) { <app-theme-icon [name]="theme.icon" [size]="26" /> }</span>
            }
            <span class="flex-1 text-left min-w-0">
              <span class="block text-[1.0625rem] font-bold" style="color:var(--text-hi)">{{ theme.name }}</span>
            </span>
            <span class="theme-radio" aria-hidden="true"></span>
          </button>
        }
        <button type="button" class="theme-tile mystery" [class.dim]="picked() !== null && picked() !== 'mystery'" [class.picked]="picked() === 'mystery'"
          [class.landed]="mysteryLanded()" [disabled]="picked() !== null" data-theme-id="mystery" (click)="choose.emit(null)">
          @if (hasIcons()) {
            <span class="theme-icon"></span>
          }
          <span class="flex-1 text-left min-w-0">
            <span class="block text-[1.0625rem] font-bold break-words" style="color:var(--text-indigo)" data-testid="run-theme-mystery-name" [attr.aria-live]="mysteryLanded() ? 'polite' : null">{{ mysteryName() ?? ('runs.theme.mystery' | translate) }}</span>
            <span class="block text-xs mt-0.5" style="color:var(--text-muted)">{{ mysteryHint() | translate }}</span>
          </span>
          <span class="theme-radio" aria-hidden="true"></span>
        </button>
      </div>
    </div>
  `,
  styles: `
    .theme-tile {
      display: flex; align-items: center; gap: 0.75rem; padding: 0.875rem 1rem; border-radius: var(--radius-card); width: 100%; min-height: 68px;
      border: 1px solid var(--border-neutral); background: var(--bg-surface); transition: opacity 0.3s, border-color 0.3s;
    }
    .theme-tile.mystery { border-style: dashed; border-color: rgb(var(--rgb-violet) / 0.6); }
    .theme-tile:disabled { cursor: default; }
    .theme-tile.dim { opacity: 0.3; }
    .theme-tile.picked { border-style: solid; border-color: var(--color-accent); background: rgb(var(--rgb-accent) / 0.08); }
    .theme-tile.mystery.picked { border-color: var(--text-indigo); background: rgb(var(--rgb-violet) / 0.08); }
    .theme-icon { width: 26px; flex: none; display: inline-flex; color: var(--text-light); }
    .theme-tile.picked .theme-icon { color: var(--color-accent); }
    .theme-radio {
      width: 1.25rem; height: 1.25rem; border-radius: 50%; border: 1.5px solid var(--border-neutral); flex: none;
      display: grid; place-items: center;
    }
    .theme-tile.picked .theme-radio { border-color: var(--color-accent); }
    .theme-tile.picked .theme-radio::after { content: ''; width: 0.625rem; height: 0.625rem; border-radius: 50%; background: var(--color-accent); }
    .theme-tile.mystery.picked .theme-radio { border-color: var(--text-indigo); }
    .theme-tile.mystery.picked .theme-radio::after { background: var(--text-indigo); }
    .theme-tile.landed [data-testid='run-theme-mystery-name'] { animation: theme-land 0.35s ease-out; }
    @keyframes theme-land { from { transform: translateY(-6px); opacity: 0.3; } to { transform: none; opacity: 1; } }
    @media (prefers-reduced-motion: reduce) { .theme-tile { transition: none; } .theme-tile.landed [data-testid='run-theme-mystery-name'] { animation: none; } }
  `,
})
export class RunThemeScreenComponent {
  /** La manche à thème et les deux thèmes proposés. */
  readonly choice = input.required<RunThemeChoice>();
  /** Le choix envoyé : l'identifiant d'un thème, `'mystery'` ; `null` : rien encore. */
  readonly picked = input<number | 'mystery' | null>(null);
  /** Le thème que le serveur a retenu pour ce choix, dès qu'il a répondu ; `null` d'ici là. */
  readonly result = input<string | null>(null);
  /** Un thème (`null` : « Thème mystère »). */
  readonly choose = output<number | null>();
  /** Le thème retenu a été montré : la manche peut suivre. */
  readonly revealed = output();

  private readonly destroyRef = inject(DestroyRef);
  protected readonly hasIcons = computed(() => this.choice().themes.some(theme => theme.icon));
  /** Le nom qui défile dans la ligne du thème mystère pendant le tirage ; vide : le libellé de la ligne. */
  private readonly rolling = signal<string | null>(null);
  /** Le tirage s'est posé sur un thème : le choix a été envoyé et le thème retenu connu. */
  private readonly landed = signal(false);
  protected readonly mysteryLanded = computed(() => this.landed() && this.picked() === 'mystery');
  private timers: ReturnType<typeof setTimeout>[] = [];
  private rollDone = false;

  /** Le nom affiché dans la ligne mystère : le thème retenu une fois posé, les lettres du tirage pendant, `null` avant (le libellé de la ligne). */
  protected readonly mysteryName = computed(() => (this.mysteryLanded() ? this.result() : this.rolling()));
  protected readonly mysteryHint = computed(() => {
    if (this.mysteryLanded()) return 'runs.theme.mystery';
    return this.picked() === 'mystery' ? 'runs.theme.drawing' : 'runs.theme.mysteryHint';
  });

  constructor() {
    this.destroyRef.onDestroy(() => this.clear());
    // Un thème choisi : le choix est envoyé, le thème retenu révélé dès que le serveur a répondu (et, pour le mystère, que le tirage a tourné).
    effect(() => {
      const picked = this.picked();
      untracked(() => {
        this.clear();
        this.rollDone = false;
        this.landed.set(false);
        this.rolling.set(null);
        if (picked === 'mystery') this.roll(0);
        else if (picked === null) return;
        else this.rollDone = true;
      });
    });
    effect(() => {
      const result = this.result();
      if (result === null) return;
      untracked(() => this.settle());
    });
  }

  /** Les lettres au hasard d'un nom de la longueur du thème attendu (celle d'un thème moyen : on ne la connaît pas). */
  private scramble(): string {
    const length = 7 + Math.floor(Math.random() * 6);
    return Array.from({ length }, () => SCRAMBLE_LETTERS[Math.floor(Math.random() * SCRAMBLE_LETTERS.length)]).join('');
  }

  private roll(step: number): void {
    if (motionReduced()) {
      this.rollDone = true;
      this.settle();
      return;
    }
    if (this.landed()) return;
    this.rolling.set(this.scramble());
    if (step >= ROLL_STEPS - 1) {
      // Le tirage a tourné : il se pose dès que le serveur a répondu, et tourne encore doucement s'il tarde.
      this.rollDone = true;
      this.settle();
      this.timers.push(setTimeout(() => this.roll(step), 120));
      return;
    }
    this.timers.push(setTimeout(() => this.roll(step + 1), rollGap(step)));
  }

  /** Le tirage a tourné ; si le serveur a répondu, le thème retenu se pose, puis la manche suit après un temps de lecture. */
  private settle(): void {
    const result = this.result();
    if (result === null || !this.rollDone || this.landed()) return;
    const mystery = this.picked() === 'mystery';
    this.landed.set(true);
    this.timers.push(setTimeout(() => this.revealed.emit(), mystery && !motionReduced() ? HOLD_MYSTERY_MS : HOLD_CHOSEN_MS));
  }

  private clear(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }
}
