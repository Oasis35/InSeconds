import { ChangeDetectionStrategy, Component, computed, effect, inject, input, output, untracked } from '@angular/core';
import { TranslatePipe } from '@ngx-translate/core';
import { AnswerSearchStore } from '../../data-access/answer-search.store';
import { TrackRoundStore } from '../../data-access/track-round.store';
import { RoundResult } from '../../domain/round-result';
import { RoundSubmission } from '../../domain/track-round';
import { AnswerInputComponent } from '../../ui/answer-input/answer-input.component';
import { HintPanelComponent } from '../../ui/hint-panel/hint-panel.component';
import { RevealCardComponent } from '../../ui/reveal-card/reveal-card.component';
import { RoundPlayerComponent } from '../../ui/round-player/round-player.component';
import { ButtonComponent } from '../../../ui/button/button.component';

/**
 * La manche d'un morceau, de l'écoute à la révélation : le lecteur, les indices, la saisie avec son
 * autocomplete, « Valider » et « Passer », puis la carte de révélation. Elle ne connaît pas le mode :
 * le mode fournit le `TrackRoundStore` (qu'il démarre avec ses paliers et ses indices), envoie la
 * réponse quand `answered` part, puis donne le `result` du serveur et appelle `reveal()` du store.
 *
 * Emplacements de projection du mode : `[roundActions]` (ses boutons, au-dessus de « Valider »),
 * `[roundBadge]` (à gauche de la pochette), `[roundScore]` (ses points) et `[roundNext]` (sa suite). En ligne
 * (`layout="inline"`, un mode à écoute fixe) : `[roundCorner]` (en haut à droite de la carte, son chrono) et `[roundReveal]`
 * (sa révélation, dans la carte, à la place de la carte de révélation).
 */
@Component({
  selector: 'app-track-round',
  imports: [TranslatePipe, ButtonComponent, RoundPlayerComponent, HintPanelComponent, AnswerInputComponent, RevealCardComponent],
  providers: [AnswerSearchStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let phase = round.phase();
    @if (phase !== null) {
      <!-- En ligne, toute la manche tient dans une carte (le lecteur, la saisie, puis la révélation du mode) ; son bord s'éclaircit quand
        le mode le demande (les dernières secondes de son chrono). -->
      <div class="relative flex flex-col" data-testid="track-round" [class.gap-4]="!inline()" [class.gap-3.5]="inline()"
        [class.p-3.5]="inline()" [class.inline-frame]="inline()" [class.alert]="inline() && alert()">
        @if (inline() && phase !== 'revealed' && phase !== 'audio-error' && phase !== 'no-preview') {
          <!-- Le coin du mode (son chrono), en haut à droite, au-dessus de la waveform ; pas sur le message d'un extrait illisible. -->
          <div class="absolute top-3.5 right-3.5 pointer-events-none"><ng-content select="[roundCorner]" /></div>
        }
        @if (phase !== 'revealed') {
          <app-round-player [layout]="layout()" [phase]="phase" [chosenSeconds]="round.chosenSeconds()" [steps]="round.steps()"
            [nextStep]="round.nextStep()" [position]="round.position()" [peaks]="round.waveform()?.peaks ?? null" [bass]="round.bass()"
            [stake]="round.stake()"
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
                <button appButton type="button" [block]="true" [glow]="true" (click)="retrySubmission()">
                  {{ 'gameplay.answer.retry' | translate }}
                </button>
              </div>
            } @else if (round.pendingConfirm(); as kind) {
              <div class="rounded-xl px-4 py-3 space-y-3" style="background:rgb(var(--rgb-accent) / 0.08);border:1px solid rgb(var(--rgb-accent) / 0.35)">
                <p class="text-sm text-center font-semibold" style="color:var(--color-accent)">
                  {{ (kind === 'skip' ? 'gameplay.answer.skipConfirm' : 'gameplay.answer.emptyConfirm') | translate }}
                </p>
                <div class="flex gap-2">
                  <button appButton type="button" variant="secondary" class="flex-1" (click)="round.cancelConfirm()">
                    {{ 'gameplay.answer.cancel' | translate }}
                  </button>
                  <button appButton type="button" class="flex-1" (click)="confirm()">
                    {{ (kind === 'skip' ? 'gameplay.answer.skipAnyway' : 'gameplay.answer.submitAnyway') | translate }}
                  </button>
                </div>
              </div>
            } @else {
              <button appButton type="submit" [block]="true" [glow]="true" [disabled]="phase === 'submitting'">
                {{ phase === 'submitting' ? '…' : ('gameplay.answer.validate' | translate) }}
              </button>
              <button appButton type="button" variant="neutral" [block]="true" [disabled]="phase === 'submitting'" (click)="round.askSkip()">
                {{ 'gameplay.round.skip' | translate }}
              </button>
            }
          </form>
        }

        @if (phase === 'revealed') {
          @if (result(); as revealed) {
            <app-reveal-card [result]="revealed" [bass]="round.bass()">
              <ng-content select="[roundBadge]" ngProjectAs="[roundBadge]" />
              <ng-content select="[roundScore]" ngProjectAs="[roundScore]" />
              <ng-content select="[roundNext]" ngProjectAs="[roundNext]" />
            </app-reveal-card>
          }
          <!-- La révélation propre au mode, dans la carte (en ligne). -->
          <ng-content select="[roundReveal]" />
        }
      </div>
    }
  `,
  styles: `
    .inline-frame {
      background: var(--bg-surface);
      border: 1px solid var(--border-medium);
      border-radius: var(--radius-card);
      transition: border-color 300ms;
    }
    .inline-frame.alert { border-color: rgb(var(--rgb-text) / 0.45); }
  `,
})
export class TrackRoundComponent {
  protected readonly round = inject(TrackRoundStore);
  protected readonly search = inject(AnswerSearchStore);

  /** Ce que le serveur a révélé (donné par le mode une fois la réponse enregistrée). */
  readonly result = input<RoundResult | null>(null);
  /** Le mode attend la réponse du back à une demande d'indice. */
  readonly hintPending = input(false);
  /** `inline` : toute la manche dans une carte, le bouton à gauche de la waveform (un mode à écoute fixe) ; `stacked` (défaut) : le Daily. */
  readonly layout = input<'stacked' | 'inline'>('stacked');
  /** Le bord de la carte s'éclaircit (en ligne seulement) : les dernières secondes du chrono du mode. */
  readonly alert = input(false);
  /** Le temps du mode est écoulé : la saisie part telle quelle, sans confirmation (une seule fois par morceau). */
  readonly timeUp = input(false);

  /** La réponse à envoyer ; le mode l'envoie, puis appelle `reveal()` ou `submissionFailed()` du store. */
  readonly answered = output<RoundSubmission>();
  /** Le joueur demande ce niveau d'indice ; le mode interroge le back, puis appelle `applyHints()` du store. */
  readonly hintRequested = output<number>();

  protected readonly inline = computed(() => this.layout() === 'inline');

  constructor() {
    // Un nouveau morceau repart d'une saisie vide.
    effect(() => {
      this.round.trackId();
      untracked(() => this.search.clear());
    });
    // Le temps écoulé envoie ce qui est tapé ; le domaine ne fait rien une fois la réponse partie.
    effect(() => {
      if (!this.timeUp()) return;
      untracked(() => {
        this.search.close();
        this.send(this.round.timeUp(this.search.answer()));
      });
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
