import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { DIALOG_DATA, DialogRef } from '@angular/cdk/dialog';
import { FormField, FormRoot, form, maxLength, validate } from '@angular/forms/signals';
import { TranslatePipe } from '@ngx-translate/core';
import { AppError } from '../../../../core/errors/app-error';
import { errorMessageKey } from '../../../../core/errors/error-messages';
import { ButtonComponent } from '../../../../ui/button/button.component';
import { ModalFrameComponent } from '../../../../ui/modal/modal-frame.component';
import { PoolStore } from '../../../data-access/pool.store';
import { ALT_TITLES_MAX, ARTIST_MAX_LENGTH, GENRE_MAX_LENGTH, PoolTrack, TITLE_MAX_LENGTH, trackLabel } from '../../../domain/pool-track';

/** Les autres titres saisis : un par ligne, espaces rognés, lignes vides retirées. */
function parseAltTitles(text: string): string[] {
  return text.split('\n').map(line => line.trim()).filter(line => line.length > 0);
}

/**
 * Corriger l'artiste, le titre et le genre d'un morceau. Permis à tout moment, défi du jour compris : les
 * réponses déjà données gardent leur verdict, les suivantes sont corrigées avec le nouveau nom (la
 * fenêtre prévient quand le morceau est dans le défi du jour). Ne change jamais l'identifiant Deezer.
 */
@Component({
  selector: 'app-edit-track-dialog',
  imports: [FormField, FormRoot, TranslatePipe, ButtonComponent, ModalFrameComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-modal-frame [title]="'admin.editModal.title' | translate">
      @if (track.inTodayChallenge) {
        <p role="alert" class="text-xs rounded-lg px-3 py-2 mb-3"
          style="color:var(--color-warn);background:rgb(var(--rgb-warning) / 0.08);border:1px solid rgb(var(--rgb-warning) / 0.3)">
          ⚠ {{ 'admin.editModal.todayWarning' | translate }}
        </p>
      }

      <form class="flex flex-col gap-3" [formRoot]="nameForm" (submit)="save()">
        <div class="flex flex-col gap-1">
          <label for="edit-track-artist" class="text-xs" style="color:var(--text-muted)">{{ 'admin.editModal.artist' | translate }}</label>
          <input id="edit-track-artist" type="text" cdkFocusInitial [formField]="nameForm.artist" class="app-input" />
        </div>
        <div class="flex flex-col gap-1">
          <label for="edit-track-title" class="text-xs" style="color:var(--text-muted)">{{ 'admin.editModal.titleField' | translate }}</label>
          <input id="edit-track-title" type="text" [formField]="nameForm.title" class="app-input" />
        </div>

        <div class="flex flex-col gap-1">
          <label for="edit-track-genre" class="text-xs" style="color:var(--text-muted)">{{ 'admin.editModal.genre' | translate }}</label>
          <input id="edit-track-genre" type="text" [formField]="nameForm.genre" class="app-input" />
          <p class="text-[11px]" style="color:var(--text-faint)" data-testid="edit-track-genre-hint">{{ 'admin.editModal.genreHint' | translate }}</p>
        </div>

        <div class="flex flex-col gap-1">
          <label for="edit-track-alt-titles" class="text-xs" style="color:var(--text-muted)">{{ 'admin.editModal.altTitles' | translate }}</label>
          <textarea id="edit-track-alt-titles" rows="2" [formField]="nameForm.altTitles" class="app-input"></textarea>
          @if (nameForm.altTitles().invalid()) {
            <p class="text-[11px]" style="color:var(--text-error)" role="alert" data-testid="edit-track-alt-titles-error">{{ 'admin.editModal.altTitlesError' | translate }}</p>
          }
          <p class="text-[11px]" style="color:var(--text-faint)" data-testid="edit-track-alt-titles-hint">{{ 'admin.editModal.altTitlesHint' | translate }}</p>
        </div>

        <fieldset class="flex flex-col gap-1.5">
          <legend class="text-xs mb-1" style="color:var(--text-muted)">{{ 'admin.editModal.themes' | translate }}</legend>
          <div class="flex flex-wrap gap-2" data-testid="edit-track-themes">
            @for (theme of pool.themes(); track theme.id) {
              <button type="button" role="checkbox" class="px-3 py-1 rounded-full text-xs font-bold" [attr.aria-checked]="isThemeSelected(theme.id)"
                [attr.data-theme-id]="theme.id" (click)="toggleTheme(theme.id)"
                [style.border]="isThemeSelected(theme.id) ? '1px solid var(--color-accent)' : '1px solid var(--border-neutral)'"
                [style.color]="isThemeSelected(theme.id) ? 'var(--color-accent)' : 'var(--text-light)'">{{ theme.name }}</button>
            } @empty {
              <span class="text-xs" style="color:var(--text-faint)">{{ 'admin.editModal.themesNone' | translate }}</span>
            }
          </div>
        </fieldset>

        <p class="text-xs" style="color:var(--text-muted)">{{ 'admin.editModal.hint' | translate }}</p>

        @if (errorMessage(); as key) {
          <p role="alert" class="text-xs" style="color:var(--text-error)">{{ key | translate }}</p>
        }

        <div class="flex gap-2 pt-1">
          <button type="button" appButton variant="secondary" class="flex-1" (click)="close()">{{ 'admin.editModal.cancel' | translate }}</button>
          <button type="submit" appButton class="flex-1" [disabled]="saveDisabled()">
            {{ (saving() ? 'admin.editModal.saving' : 'admin.editModal.save') | translate }}
          </button>
        </div>
      </form>

      <p class="text-[11px] mt-3" style="color:var(--text-faint)">{{ label }}</p>
    </app-modal-frame>
  `,
})
export class EditTrackDialog {
  protected readonly track = inject<PoolTrack>(DIALOG_DATA);
  protected readonly label = trackLabel(this.track);
  private readonly originalGenre = this.track.genres.join(', ');
  protected readonly pool = inject(PoolStore);
  private readonly dialog = inject<DialogRef<boolean>>(DialogRef);

  /** Deux champs non vides une fois les espaces retirés, longueurs de l'API. */
  protected readonly nameForm = form(signal({ artist: this.track.artist, title: this.track.title, genre: this.track.genres.join(', '), altTitles: this.track.altTitles.join('\n') }), path => {
    validate(path.artist, ({ value }) => (value().trim() ? null : { kind: 'required' }));
    validate(path.title, ({ value }) => (value().trim() ? null : { kind: 'required' }));
    maxLength(path.artist, ARTIST_MAX_LENGTH);
    maxLength(path.title, TITLE_MAX_LENGTH);
    // Un titre alternatif par ligne : au plus 5, de la longueur d'un titre.
    validate(path.altTitles, ({ value }) => {
      const lines = parseAltTitles(value());
      return lines.length <= ALT_TITLES_MAX && lines.every(line => line.length <= TITLE_MAX_LENGTH) ? null : { kind: 'altTitles' };
    });
    // Les genres de Deezer, joints, peuvent dépasser la limite d'un genre saisi : elle ne vaut que si le champ a changé.
    validate(path.genre, ({ value }) => (value().trim() === this.originalGenre || value().trim().length <= GENRE_MAX_LENGTH ? null : { kind: 'maxLength' }));
  });

  private readonly originalAltTitles = [...this.track.altTitles];
  private altTitlesChanged(): boolean {
    const now = parseAltTitles(this.nameForm().value().altTitles);
    return now.length !== this.originalAltTitles.length || now.some((title, i) => title !== this.originalAltTitles[i]);
  }

  /** Les thèmes cochés ; l'état d'origine sert à ne rien envoyer quand rien ne change. */
  private readonly originalThemes = [...this.track.themeIds].sort((a, b) => a - b);
  protected readonly themeIds = signal<readonly number[]>(this.originalThemes);
  private readonly themesChanged = computed(() => {
    const now = [...this.themeIds()].sort((a, b) => a - b);
    return now.length !== this.originalThemes.length || now.some((id, i) => id !== this.originalThemes[i]);
  });

  protected isThemeSelected(id: number): boolean {
    return this.themeIds().includes(id);
  }

  protected toggleTheme(id: number): void {
    this.themeIds.update(ids => (ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]));
  }

  protected readonly saving = signal(false);
  private readonly error = signal<AppError | null>(null);
  protected readonly errorMessage = computed(() => {
    const error = this.error();
    return error ? errorMessageKey(error.code) : null;
  });

  /** Désactivé : un champ invalide, rien de changé, ou un envoi en cours. */
  protected readonly saveDisabled = computed(() => {
    const { artist, title, genre } = this.nameForm().value();
    return this.nameForm().invalid() || this.saving()
      || (artist.trim() === this.track.artist && title.trim() === this.track.title && genre.trim() === this.originalGenre && !this.altTitlesChanged() && !this.themesChanged());
  });

  protected async save(): Promise<void> {
    if (this.saveDisabled()) return;
    this.saving.set(true);
    this.error.set(null);
    const { artist, title, genre, altTitles } = this.nameForm().value();
    // Le genre et les autres titres ne sont envoyés que s'ils ont changé : enregistrer l'artiste seul ne remplace jamais les genres de Deezer. Les thèmes aussi seulement s'ils changent.
    const namesChanged = artist.trim() !== this.track.artist || title.trim() !== this.track.title || genre.trim() !== this.originalGenre || this.altTitlesChanged();
    const genreToSend = genre.trim() === this.originalGenre ? undefined : genre;
    const altTitlesToSend = this.altTitlesChanged() ? parseAltTitles(altTitles) : undefined;
    let error: AppError | null = null;
    if (namesChanged) error = await this.pool.rename(this.track.id, artist, title, genreToSend, altTitlesToSend);
    if (!error && this.themesChanged()) error = await this.pool.setTrackThemes(this.track.id, this.themeIds());
    this.saving.set(false);
    if (error) this.error.set(error);
    else this.dialog.close(true);
  }

  protected close(): void {
    this.dialog.close(false);
  }
}
