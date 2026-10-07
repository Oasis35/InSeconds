import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { AnswerSuggestion } from '../domain/answer';

/**
 * Le champ de réponse « Artiste — Titre » avec son autocomplete : liste de propositions, bouton ✕
 * qui efface, navigation au clavier. Présentationnel : il annonce ce que fait le joueur, le store
 * décide. Entrée valide la saisie (le formulaire parent) sauf si une proposition est en
 * surbrillance, qu'elle choisit alors.
 */
@Component({
  selector: 'app-answer-input',
  imports: [TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // Bloc, pas en ligne : sinon l'espacement du formulaire parent (`space-y-3`) ne s'applique pas.
  host: { class: 'block' },
  template: `
    <div class="relative">
      <input type="text" name="answer" autocomplete="off" role="combobox" aria-autocomplete="list"
        [attr.aria-expanded]="suggestions().length > 0" [value]="query()"
        [placeholder]="'gameplay.answer.placeholder' | translate"
        [attr.aria-label]="'gameplay.answer.placeholder' | translate"
        (input)="queryChange.emit($any($event.target).value)"
        (focus)="focused.emit()" (blur)="blurred.emit()" (keydown)="onKeydown($event)"
        class="app-input" [style.paddingRight]="query() ? '2.5rem' : '1rem'" />

      @if (query()) {
        <button type="button" (mousedown)="onClear($event)" [title]="'gameplay.answer.clear' | translate"
          class="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full transition touch-manipulation hover:text-slate-400"
          style="color:var(--text-muted);background:var(--border-subtle)">✕</button>
      }

      @if (suggestions().length > 0) {
        <!-- fond opaque : la liste passe par-dessus « Valider » et « Passer » -->
        <ul role="listbox" class="absolute z-10 w-full mt-1 rounded-xl overflow-hidden shadow-2xl"
          style="background:var(--bg-surface-2);border:1px solid var(--border-strong)">
          @for (suggestion of suggestions(); track suggestion.artist + ' — ' + suggestion.title; let i = $index) {
            <li role="option" [attr.aria-selected]="i === highlighted()"
              (mousedown)="onPick($event, suggestion)" (mouseenter)="highlight.emit(i)"
              class="px-4 py-3 cursor-pointer text-sm transition hover:bg-white/[0.03]"
              [style.background]="i === highlighted() ? 'rgb(var(--rgb-accent-2) / 0.15)' : null"
              style="border-bottom:1px solid rgba(255,255,255,0.04)">
              <span class="font-medium" style="color:var(--text-body)">{{ suggestion.artist }}</span>
              <span style="color:var(--text-faint)"> — </span>
              <span style="color:var(--text-hover)">{{ suggestion.title }}</span>
            </li>
          }
        </ul>
      }
    </div>
  `,
})
export class AnswerInputComponent {
  readonly query = input('');
  /** Les propositions à montrer (vide si la liste est fermée). */
  readonly suggestions = input<readonly AnswerSuggestion[]>([]);
  /** -1 : aucune en surbrillance. */
  readonly highlighted = input(-1);

  readonly queryChange = output<string>();
  readonly pick = output<AnswerSuggestion>();
  /** Entrée avec une proposition en surbrillance : le store choisit celle-là. */
  readonly pickHighlighted = output<void>();
  readonly clear = output<void>();
  readonly move = output<1 | -1>();
  readonly highlight = output<number>();
  /** Échap : ferme la liste, sans toucher au champ. */
  readonly dismiss = output<void>();
  readonly focused = output<void>();
  readonly blurred = output<void>();

  protected onKeydown(event: KeyboardEvent): void {
    if (this.suggestions().length === 0) return;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        this.move.emit(1);
        break;
      case 'ArrowUp':
        event.preventDefault();
        this.move.emit(-1);
        break;
      case 'Enter':
        if (this.highlighted() >= 0) {
          // choisit la proposition au lieu de valider le formulaire
          event.preventDefault();
          this.pickHighlighted.emit();
        }
        break;
      case 'Escape':
        this.dismiss.emit();
        break;
    }
  }

  /** `mousedown` et pas `click` : il passe avant le `blur` du champ, qui ferme la liste. */
  protected onPick(event: MouseEvent, suggestion: AnswerSuggestion): void {
    event.preventDefault();
    this.pick.emit(suggestion);
  }

  protected onClear(event: MouseEvent): void {
    event.preventDefault();
    this.clear.emit();
  }
}
