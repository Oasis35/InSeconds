import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { PoolTheme, PoolTrack, ThemeAssignment } from '../../../domain/pool-track';
import { ParsedClassification, assignmentsOf, exclusionKey, parseClassification, previewImport, totalToAdd } from '../../../domain/theme-import';
import { ButtonComponent } from '../../../../ui/button/button.component';

type Step = 'input' | 'preview';

/**
 * L'import d'un classement (« thème ; id du morceau », collé ou lu dans un fichier) en deux temps : on dépose le classement, puis un **aperçu**
 * montre, thème par thème, ce qui sera ajouté (cases à décocher, écoute ▶), ce qui y est déjà, les thèmes inconnus et les identifiants absents du
 * pool. Rien n'est écrit avant « Appliquer » ; rien n'est jamais retiré ni créé. Le résultat (`added`) remplace l'aperçu une fois appliqué.
 */
@Component({
  selector: 'app-theme-import',
  imports: [TranslatePipe, ButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col gap-3 w-full max-w-2xl mx-auto">
      <div class="flex items-center justify-between gap-3">
        <h2 class="text-xl font-semibold" style="color:var(--text-hi)">{{ 'admin.themes.import.title' | translate }}</h2>
        <button type="button" class="text-sm underline min-h-11 px-2" style="color:var(--text-muted)" (click)="closed.emit()" data-testid="import-close">{{ 'admin.themes.close' | translate }}</button>
      </div>

      @if (added() !== null) {
        <div class="rounded-(--radius-card) p-4 flex flex-col gap-3" style="background:var(--bg-surface-2);border:1px solid var(--border-strong)" data-testid="import-result" role="status">
          <p class="text-base" style="color:var(--text-hi)">{{ 'admin.themes.import.done' | translate: { count: added() } }}</p>
          <div class="flex flex-wrap gap-2">
            <button type="button" appButton variant="neutral" (click)="again()" data-testid="import-again">{{ 'admin.themes.import.another' | translate }}</button>
            <button type="button" appButton (click)="closed.emit()">{{ 'admin.themes.import.backToThemes' | translate }}</button>
          </div>
        </div>
      } @else if (step() === 'input') {
        <p class="text-sm" style="color:var(--text-muted)">{{ 'admin.themes.import.help' | translate }}</p>
        <textarea class="app-input min-h-48 font-mono" [value]="text()" (input)="text.set(valueOf($event))" spellcheck="false"
          [placeholder]="'admin.themes.import.placeholder' | translate" [attr.aria-label]="'admin.themes.import.title' | translate" data-testid="import-text"></textarea>
        <label class="text-sm underline self-start min-h-11 inline-flex items-center cursor-pointer focus-within:outline-2 focus-within:outline-offset-2" style="color:var(--text-muted)">
          {{ 'admin.themes.import.pickFile' | translate }}
          <input type="file" accept=".csv,.txt,text/csv,text/plain" class="sr-only" (change)="readFile($event)" data-testid="import-file" />
        </label>
        <button type="button" appButton [disabled]="!text().trim()" (click)="toPreview()" data-testid="import-preview">{{ 'admin.themes.import.preview' | translate }}</button>
      } @else {
        <div class="flex flex-wrap gap-2 text-sm" data-testid="import-summary">
          <span class="px-2.5 py-0.5 rounded-full" [style.color]="total() > 0 ? 'var(--color-success)' : 'var(--text-muted)'" [style.border]="'1px solid ' + (total() > 0 ? 'var(--color-success)' : 'var(--border-neutral)')">{{ 'admin.themes.import.toAdd' | translate: { count: total() } }}</span>
          @if (alreadyCount() > 0) {
            <span class="px-2.5 py-0.5 rounded-full" style="color:var(--text-muted);border:1px solid var(--border-neutral)">{{ 'admin.themes.import.already' | translate: { count: alreadyCount() } }}</span>
          }
          @if (preview().unknownTracks.length > 0) {
            <span class="px-2.5 py-0.5 rounded-full" style="color:var(--text-error);border:1px solid var(--text-error)">{{ 'admin.themes.import.unknownTracks' | translate: { count: preview().unknownTracks.length } }}</span>
          }
        </div>

        @if (preview().issues.length > 0 || preview().unknownTracks.length > 0) {
          <details class="rounded-(--radius-button) px-3 py-2 text-sm" style="background:rgb(var(--rgb-danger) / 0.1);border:1px solid rgb(var(--rgb-danger) / 0.4);color:var(--text-error)" data-testid="import-problems">
            <summary class="cursor-pointer">{{ 'admin.themes.import.problems' | translate: { count: preview().issues.length + preview().unknownTracks.length } }}</summary>
            <ul class="mt-2 flex flex-col gap-1">
              @for (issue of preview().issues; track issue.line) {
                <li>{{ 'admin.themes.import.badLine' | translate: { line: issue.line, text: issue.text } }}</li>
              }
              @for (line of preview().unknownTracks; track $index) {
                <li>{{ 'admin.themes.import.noTrack' | translate: { line: line.line, id: line.trackId } }}</li>
              }
            </ul>
          </details>
        }

        @for (group of preview().groups; track group.themeName) {
          <section class="rounded-(--radius-card) px-3" style="background:var(--bg-surface-2);border:1px solid var(--border-strong)" data-testid="import-group">
            <h3 class="py-3 flex items-center justify-between gap-3 text-base font-semibold" style="color:var(--text-hi)">
              <span class="truncate">{{ group.themeName }}</span>
              @if (group.themeId === null) {
                <span class="text-xs font-normal" style="color:var(--text-error)" data-testid="import-unknown-theme">{{ 'admin.themes.import.unknownTheme' | translate }}</span>
              } @else {
                <span class="text-xs font-normal shrink-0" style="color:var(--text-muted)">{{ 'admin.themes.import.toAdd' | translate: { count: group.toAdd } }}</span>
              }
            </h3>
            @if (group.themeId !== null) {
              <ul>
                @for (item of group.tracks; track item.track.id) {
                  <li class="flex items-center gap-3 py-2.5" style="border-top:1px solid var(--border-subtle)" data-testid="import-track">
                    <input type="checkbox" class="w-6 h-6 shrink-0 cursor-pointer disabled:opacity-40" [disabled]="item.alreadyIn"
                      [checked]="!item.alreadyIn && !excluded().has(keyOf(group.themeId, item.track.id))" (change)="toggle(group.themeId, item.track.id)"
                      [attr.aria-label]="item.track.artist + ' - ' + item.track.title" />
                    <button type="button" (click)="listen.emit(item.track)" class="text-xs min-h-11 min-w-11 inline-flex items-center justify-center rounded-(--radius-button) shrink-0"
                      style="color:var(--text-indigo);border:1px solid rgb(var(--rgb-violet) / 0.3)" [title]="'admin.pool.listenTitle' | translate"
                      [attr.aria-label]="'admin.pool.listenTitle' | translate">▶</button>
                    <span class="flex-1 min-w-0 flex flex-col">
                      <span class="truncate text-sm" style="color:var(--text-hi)">{{ item.track.title }}</span>
                      <span class="truncate text-xs" style="color:var(--text-muted)">{{ item.track.artist }}</span>
                    </span>
                    @if (item.alreadyIn) {
                      <span class="text-xs shrink-0" style="color:var(--text-muted)">{{ 'admin.themes.import.alreadyChip' | translate }}</span>
                    }
                  </li>
                }
              </ul>
            }
          </section>
        } @empty {
          <p class="text-sm" style="color:var(--text-muted)" data-testid="import-empty">{{ 'admin.themes.import.nothing' | translate }}</p>
        }

        @if (errorKey(); as key) {
          <p role="alert" class="text-xs" style="color:var(--text-error)" data-testid="import-error">{{ key | translate }}</p>
        }

        <div class="flex flex-wrap gap-2 sticky bottom-0 py-2" style="background:var(--bg-page)">
          <button type="button" appButton variant="neutral" class="flex-1" (click)="step.set('input')" data-testid="import-back">{{ 'admin.themes.import.edit' | translate }}</button>
          <button type="button" appButton class="flex-1" [disabled]="total() === 0 || busy()" (click)="apply()" data-testid="import-apply">
            {{ 'admin.themes.import.apply' | translate: { count: total() } }}
          </button>
        </div>
      }
    </div>
  `,
})
export class ThemeImportComponent {
  readonly tracks = input.required<readonly PoolTrack[]>();
  readonly themes = input.required<readonly PoolTheme[]>();
  readonly busy = input(false);
  readonly errorKey = input<string | null>(null);
  /** Le nombre de liens créés une fois le classement appliqué ; `null` tant qu'il ne l'est pas. */
  readonly added = input<number | null>(null);

  readonly closed = output();
  readonly listen = output<PoolTrack>();
  readonly applied = output<readonly ThemeAssignment[]>();
  /** « Importer un autre classement » : le résultat est à effacer. */
  readonly reset = output();

  protected readonly step = signal<Step>('input');
  protected readonly text = signal('');
  protected readonly excluded = signal<ReadonlySet<string>>(new Set());
  private readonly parsed = signal<ParsedClassification>({ lines: [], issues: [] });

  protected readonly preview = computed(() => previewImport(this.parsed(), this.themes(), this.tracks(), this.excluded()));
  protected readonly total = computed(() => totalToAdd(this.preview()));
  protected readonly alreadyCount = computed(() => this.preview().groups.reduce((n, g) => n + g.tracks.filter(t => t.alreadyIn).length, 0));

  protected valueOf(event: Event): string {
    return (event.target as HTMLTextAreaElement).value;
  }

  protected keyOf(themeId: number, trackId: number): string {
    return exclusionKey(themeId, trackId);
  }

  protected async readFile(event: Event): Promise<void> {
    const file = (event.target as HTMLInputElement).files?.[0];
    if (file) this.text.set(await file.text());
  }

  protected toPreview(): void {
    this.parsed.set(parseClassification(this.text()));
    this.excluded.set(new Set());
    this.step.set('preview');
  }

  protected toggle(themeId: number, trackId: number): void {
    const key = this.keyOf(themeId, trackId);
    this.excluded.update(set => {
      const next = new Set(set);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  }

  protected apply(): void {
    this.applied.emit(assignmentsOf(this.preview(), this.excluded()));
  }

  protected again(): void {
    this.text.set('');
    this.step.set('input');
    this.reset.emit();
  }
}
