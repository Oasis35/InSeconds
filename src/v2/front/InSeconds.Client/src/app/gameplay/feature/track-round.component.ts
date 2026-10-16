import { ChangeDetectionStrategy, Component, effect, inject, input, output, untracked } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { AnswerSearchStore } from '../data-access/answer-search.store';
import { TrackRoundStore } from '../data-access/track-round.store';
import { RoundResult } from '../domain/round-result';
import { RoundSubmission } from '../domain/track-round';
import { AnswerInputComponent } from '../ui/answer-input.component';
import { HintPanelComponent } from '../ui/hint-panel.component';
import { RevealCardComponent } from '../ui/reveal-card.component';
import { RoundPlayerComponent } from '../ui/round-player.component';

/**
 * La manche d'un morceau, de l'écoute à la révélation : le lecteur, les indices, la saisie avec son
 * autocomplete, « Valider » et « Passer », puis la carte de révélation. Elle ne connaît pas le mode :
 * le mode fournit le `TrackRoundStore` (qu'il démarre avec ses paliers et ses indices), envoie la
 * réponse quand `answered` part, puis donne le `result` du serveur et appelle `reveal()` du store.
 *
 * Emplacements de projection du mode : `[roundActions]` (ses boutons, au-dessus de « Valider »),
 * `[roundBadge]` (au-dessus de la pochette), `[roundScore]` (ses points) et `[roundNext]` (sa suite).
 */
@Component({
  selector: 'app-track-round',
  imports: [TranslatePipe, RoundPlayerComponent, HintPanelComponent, AnswerInputComponent, RevealCardComponent],
  providers: [AnswerSearchStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let phase = round.phase();
    @if (phase !== null) {
      <div class="flex flex-col gap-4">
        @if (phase !== 'revealed') {
          <app-round-player [phase]="phase" [chosenSeconds]="round.chosenSeconds()" [steps]="round.steps()"
            [nextStep]="round.nextStep()" [position]="round.position()"
            (replay)="round.replay()" (listenMore)="round.listenMore()" (retry)="round.retryPlayback()" (skip)="skipUnplayable()" />
        }

        @if (round.showsInput()) {
          <form (submit)="onSubmit($event)" class="space-y-3">
            <app-hint-panel [levels]="round.availableHintLevels()" [kinds]="round.hintKinds()" [hints]="round.hints()" [pending]="hintPending()"
              (request)="hintRequested.emit($event)" />

            <app-answer-input [query]="search.query()" [suggestions]="search.visibleSuggestions()" [highlighted]="search.highlighted()"
              (queryChange)="onQueryChange($event)" (pick)="search.select($event)" (enter)="onEnter($event)"
              (clear)="onClear()" (move)="search.moveHighlight($event)" (highlight)="search.highlight($event)"
              (dismiss)="search.close()" (focused)="search.openList()" (blurred)="search.close()" />

            <ng-content select="[roundActions]" />

            @if (phase === 'submit-error') {
              <div class="rounded-xl px-4 py-3 space-y-3" style="background:rgb(var(--rgb-danger) / 0.08);border:1px solid rgb(var(--rgb-danger) / 0.3)">
                <p role="alert" class="text-sm text-center font-semibold" style="color:var(--text-error)">{{ 'gameplay.answer.submitFailed' | translate }}</p>
                <button type="button" (click)="retrySubmission()"
                  class="w-full py-3.5 rounded-full text-sm font-bold tracking-wide uppercase transition touch-manipulation"
                  style="font-family:var(--font-display);letter-spacing:0.06em;background:var(--gradient-primary);color:var(--text-on-primary);box-shadow:var(--glow-primary)">
                  {{ 'gameplay.answer.retry' | translate }}
                </button>
              </div>
            } @else if (round.pendingConfirm(); as kind) {
              <div class="rounded-xl px-4 py-3 space-y-3" style="background:rgb(var(--rgb-accent) / 0.08);border:1px solid rgb(var(--rgb-accent) / 0.35)">
                <p class="text-sm text-center font-semibold" style="color:var(--color-accent)">
                  {{ (kind === 'skip' ? 'gameplay.answer.skipConfirm' : 'gameplay.answer.emptyConfirm') | translate }}
                </p>
                <div class="flex gap-2">
                  <button type="button" (click)="round.cancelConfirm()"
                    class="flex-1 py-2.5 rounded-lg text-sm font-semibold transition touch-manipulation"
                    style="background:var(--bg-inactive);color:var(--text-hover);border:1px solid var(--border-subtle)">
                    {{ 'gameplay.answer.cancel' | translate }}
                  </button>
                  <button type="button" (click)="confirm()"
                    class="flex-1 py-2.5 rounded-lg text-sm font-bold uppercase transition touch-manipulation"
                    style="font-family:var(--font-display);letter-spacing:0.04em;background:var(--gradient-primary);color:var(--text-on-primary)">
                    {{ (kind === 'skip' ? 'gameplay.answer.skipAnyway' : 'gameplay.answer.submitAnyway') | translate }}
                  </button>
                </div>
              </div>
            } @else {
              <button type="submit" [disabled]="phase === 'submitting'"
                class="w-full py-3.5 rounded-full text-sm font-bold tracking-wide uppercase transition touch-manipulation disabled:opacity-60"
                style="font-family:var(--font-display);background:var(--gradient-primary);color:var(--text-on-primary);letter-spacing:0.06em;box-shadow:var(--glow-primary)">
                {{ phase === 'submitting' ? '…' : ('gameplay.answer.validate' | translate) }}
              </button>
              <button type="button" (click)="round.askSkip()" [disabled]="phase === 'submitting'"
                class="w-full py-3.5 rounded-lg text-sm font-bold tracking-wide uppercase transition active:scale-95 touch-manipulation disabled:opacity-60"
                style="font-family:var(--font-display);letter-spacing:0.06em;border:1.5px solid rgb(var(--rgb-accent-2) / 0.7);background:transparent;color:var(--color-accent-2)">
                {{ 'gameplay.round.skip' | translate }}
              </button>
            }
          </form>
        }

        @if (phase === 'revealed' && result(); as revealed) {
          <app-reveal-card [result]="revealed">
            <ng-content select="[roundBadge]" ngProjectAs="[roundBadge]" />
            <ng-content select="[roundScore]" ngProjectAs="[roundScore]" />
            <ng-content select="[roundNext]" ngProjectAs="[roundNext]" />
          </app-reveal-card>
        }
      </div>
    }
  `,
})
export class TrackRoundComponent {
  protected readonly round = inject(TrackRoundStore);
  protected readonly search = inject(AnswerSearchStore);

  /** Ce que le serveur a révélé (donné par le mode une fois la réponse enregistrée). */
  readonly result = input<RoundResult | null>(null);
  /** Le mode attend la réponse du back à une demande d'indice. */
  readonly hintPending = input(false);

  /** La réponse à envoyer ; le mode l'envoie, puis appelle `reveal()` ou `submissionFailed()` du store. */
  readonly answered = output<RoundSubmission>();
  /** Le joueur demande ce niveau d'indice ; le mode interroge le back, puis appelle `applyHints()` du store. */
  readonly hintRequested = output<number>();

  constructor() {
    // Un nouveau morceau repart d'une saisie vide.
    effect(() => {
      this.round.trackId();
      untracked(() => this.search.clear());
    });
  }

  protected onSubmit(event: Event): void {
    event.preventDefault();
    this.send(this.round.submit(this.search.answer()));
  }

  protected confirm(): void {
    this.send(this.round.confirm(this.search.answer()));
  }

  protected skipUnplayable(): void {
    this.send(this.round.skipUnplayable());
  }

  protected retrySubmission(): void {
    this.send(this.round.retrySubmission());
  }

  /** Retaper ferme la confirmation en attente : elle porterait sur l'ancienne saisie. */
  protected onQueryChange(query: string): void {
    this.search.setQuery(query);
    this.round.cancelConfirm();
  }

  /** Entrée dans le champ : une proposition en surbrillance est choisie (et le formulaire ne part pas), sinon la saisie se valide. */
  protected onEnter(event: KeyboardEvent): void {
    if (this.search.selectHighlighted()) event.preventDefault();
  }

  protected onClear(): void {
    this.search.clear();
    this.round.cancelConfirm();
  }

  private send(submission: RoundSubmission | null): void {
    if (submission) this.answered.emit(submission);
  }
}
