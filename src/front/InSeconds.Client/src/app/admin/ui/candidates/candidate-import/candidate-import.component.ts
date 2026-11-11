import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { ButtonComponent } from '../../../../ui/button/button.component';
import {
  CANDIDATE_PRIORITIES, CandidatePriority, MAX_CANDIDATE_IMPORT, ParsedCandidateImport, parseCandidateImport,
} from '../../../domain/candidates';

/**
 * L'import dans le sas « À valider » : l'admin colle des identifiants Deezer (ou des adresses de morceaux), ou charge un fichier, avec si il
 * veut une priorité A, B ou C par ligne ou pour tout le lot. Aucune limite de 50 : jusqu'à `MAX_CANDIDATE_IMPORT` d'un coup, la lecture chez
 * Deezer se fait ensuite en arrière-plan. Rien n'entre dans le pool avant que l'admin ne l'ajoute.
 */
@Component({
  selector: 'app-candidate-import',
  imports: [TranslatePipe, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <form class="flex flex-col gap-3" (submit)="submit($event)">
      <textarea class="app-input min-h-32 font-mono" [value]="text()" (input)="text.set(valueOf($event))" spellcheck="false"
        [placeholder]="'admin.candidates.placeholder' | translate" [attr.aria-label]="'admin.candidates.importLabel' | translate" data-testid="candidates-text"></textarea>
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1">
        <label class="text-sm underline min-h-11 inline-flex items-center cursor-pointer focus-within:outline-2 focus-within:outline-offset-2" style="color:var(--text-muted)">
          {{ 'admin.candidates.pickFile' | translate }}
          <input type="file" accept=".csv,.txt,text/csv,text/plain" class="sr-only" (change)="readFile($event)" data-testid="candidates-file" />
        </label>
        <label class="text-sm inline-flex items-center gap-2" style="color:var(--text-muted)">
          {{ 'admin.candidates.defaultPriority' | translate }}
          <select class="app-input w-auto" [value]="priority() ?? ''" (change)="setPriority($event)" data-testid="candidates-priority">
            <option value="">{{ 'admin.candidates.noPriority' | translate }}</option>
            @for (p of priorities; track p) { <option [value]="p">{{ p }}</option> }
          </select>
        </label>
      </div>
      @if (parsed().issues.length > 0) {
        <p role="alert" class="text-xs" style="color:var(--text-error)" data-testid="candidates-issues">
          {{ 'admin.candidates.issues' | translate: { count: parsed().issues.length, lines: issueLines() } }}
        </p>
      }
      @if (tooMany()) {
        <p role="alert" class="text-xs" style="color:var(--text-error)" data-testid="candidates-too-many">{{ 'admin.candidates.tooMany' | translate: { max: max } }}</p>
      }
      @if (errorKey(); as key) {
        <p role="alert" class="text-xs" style="color:var(--text-error)" data-testid="candidates-error">{{ key | translate }}</p>
      }
      <button type="submit" appButton class="self-start" [disabled]="busy() || parsed().items.length === 0 || tooMany()" data-testid="candidates-import">
        {{ 'admin.candidates.import' | translate: { count: parsed().items.length } }}
      </button>
    </form>
  `,
})
export class CandidateImportComponent {
  /** Un envoi est en cours. */
  readonly busy = input(false);
  /** La clé de traduction de l'erreur du dernier import, vide sinon. */
  readonly errorKey = input<string | null>(null);
  /** Ce que l'admin veut importer (jamais vide) ; le texte est vidé une fois l'envoi parti. */
  readonly imported = output<ParsedCandidateImport>();

  protected readonly priorities = CANDIDATE_PRIORITIES;
  protected readonly max = MAX_CANDIDATE_IMPORT;
  protected readonly text = signal('');
  protected readonly priority = signal<CandidatePriority | null>(null);
  protected readonly parsed = computed(() => parseCandidateImport(this.text(), this.priority()));
  protected readonly tooMany = computed(() => this.parsed().items.length > MAX_CANDIDATE_IMPORT);
  protected readonly issueLines = computed(() => this.parsed().issues.slice(0, 5).map(i => i.line).join(', '));

  protected valueOf(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }

  protected setPriority(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.priority.set(value === 'A' || value === 'B' || value === 'C' ? value : null);
  }

  protected async readFile(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file) this.text.set(await file.text());
    input.value = '';
  }

  protected submit(event: Event): void {
    event.preventDefault();
    const parsed = this.parsed();
    if (this.busy() || parsed.items.length === 0 || this.tooMany()) return;
    this.imported.emit(parsed);
    this.text.set('');
  }
}
