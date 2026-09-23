import { Component, ChangeDetectionStrategy, OnInit, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { DecorBackgroundComponent } from '../../shared/decor-background/decor-background.component';
import { ConfirmSheetComponent } from '../../shared/confirm-sheet/confirm-sheet.component';
import { PlayerSessionService } from '../../core/services/player-session.service';
import { pluralKey } from '../../core/models/streak';
import { FreezeCellsComponent } from '../../shared/freeze-cells/freeze-cells.component';

type PseudoStatus = 'idle' | 'saving' | 'saved' | 'taken' | 'error';
type EmailStatus = 'idle' | 'sending' | 'sent' | 'sameEmail' | 'taken' | 'error';

// Format simple, aligné sur EmailAddress() FluentValidation côté back — pas de RFC
// exhaustive ici, juste de quoi éviter un aller-retour serveur pour une saisie vide/absurde.
// Quantificateurs bornés (au lieu de `+` illimités) : évite le risque de backtracking
// super-linéaire sur une entrée pathologique (Sonar typescript:S8786), sans changer le
// comportement pour une adresse email réelle (limites RFC 5321 généreuses : 64/253/24).
const EMAIL_PATTERN = /^[^\s@]{1,64}@[^\s@]{1,253}\.[^\s@]{2,24}$/;

@Component({
  selector: 'app-profile',
  imports: [FormsModule, RouterLink, TranslatePipe, DecorBackgroundComponent, ConfirmSheetComponent, FreezeCellsComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile.component.html',
})
export class ProfileComponent implements OnInit {
  protected readonly playerSession = inject(PlayerSessionService);
  private readonly router = inject(Router);
  private readonly translate = inject(TranslateService);

  protected readonly streak = this.playerSession.currentStreak;
  protected readonly gamesPlayed = this.playerSession.gamesPlayed;
  protected readonly email = this.playerSession.email;
  protected readonly freezes = computed(() => this.playerSession.streak()?.freezes ?? 0);
  protected readonly maxFreezes = computed(() => this.playerSession.streak()?.maxFreezes ?? 0);

  /** « 2 gels · stock plein » ou « 1 gel · prochain dans 5 jours ». */
  protected readonly freezesText = computed(() => {
    const streak = this.playerSession.streak();
    if (!streak) return '';
    if (streak.freezes >= streak.maxFreezes)
      return this.translate.instant('streakFreeze.profile.full', { max: streak.maxFreezes });
    const remaining = streak.nextFreezeInDays ?? 0;
    const days = this.translate.instant(`streakFreeze.profile.days.${pluralKey(remaining)}`, { n: remaining });
    return this.translate.instant(`streakFreeze.profile.stock.${pluralKey(streak.freezes)}`, { n: streak.freezes, days });
  });

  protected pseudoDraft = signal(this.playerSession.pseudo() ?? '');
  protected readonly pseudoStatus = signal<PseudoStatus>('idle');
  protected readonly showLogoutConfirm = signal(false);
  protected readonly loggingOut = signal(false);
  protected readonly logoutError = signal(false);

  private readonly trimmedDraft = computed(() => this.pseudoDraft().trim());
  private readonly tooShort = computed(() => this.trimmedDraft().length > 0 && this.trimmedDraft().length < 3);
  private readonly invalid = computed(() => this.trimmedDraft().length === 0 || this.tooShort() || this.trimmedDraft().length > 20);
  private readonly unchanged = computed(() => this.trimmedDraft() === (this.playerSession.pseudo() ?? ''));

  protected readonly saveDisabled = computed(() =>
    this.invalid() || this.unchanged() || this.pseudoStatus() === 'saving');

  protected readonly saveLabel = computed(() => {
    switch (this.pseudoStatus()) {
      case 'saving': return this.translate.instant('profile.saving');
      case 'saved':  return this.translate.instant('profile.saved');
      default:       return this.translate.instant('profile.save');
    }
  });

  protected readonly hint = computed(() => {
    switch (this.pseudoStatus()) {
      case 'taken': return this.translate.instant('profile.pseudoTaken');
      case 'saved': return this.translate.instant('profile.pseudoSaved');
      case 'error': return this.translate.instant('profile.pseudoError');
      default:
        return this.tooShort()
          ? this.translate.instant('profile.pseudoTooShort')
          : this.translate.instant('profile.pseudoHint');
    }
  });

  protected readonly hintIsError = computed(() =>
    this.pseudoStatus() === 'taken' || this.pseudoStatus() === 'error' || this.tooShort());

  protected emailDraft = signal(this.playerSession.email() ?? '');
  protected readonly emailStatus = signal<EmailStatus>('idle');

  private readonly trimmedEmailDraft = computed(() => this.emailDraft().trim());
  private readonly emailInvalid = computed(() =>
    this.trimmedEmailDraft().length === 0 || !EMAIL_PATTERN.test(this.trimmedEmailDraft()));
  private readonly emailUnchanged = computed(() =>
    this.trimmedEmailDraft().toLowerCase() === (this.playerSession.email() ?? '').toLowerCase());

  protected readonly emailSaveDisabled = computed(() =>
    this.emailInvalid() || this.emailUnchanged() || this.emailStatus() === 'sending');

  protected readonly emailSaveLabel = computed(() => {
    switch (this.emailStatus()) {
      case 'sending': return this.translate.instant('profile.email.sending');
      case 'sent':    return this.translate.instant('profile.email.sent');
      default:        return this.translate.instant('profile.email.change');
    }
  });

  protected readonly emailHint = computed(() => {
    switch (this.emailStatus()) {
      case 'sent':      return this.translate.instant('profile.email.sentHint', { email: this.trimmedEmailDraft() });
      case 'sameEmail': return this.translate.instant('profile.email.sameEmail');
      case 'taken':     return this.translate.instant('profile.email.taken');
      case 'error':     return this.translate.instant('profile.email.error');
      default:
        return this.emailInvalid() && this.trimmedEmailDraft().length > 0
          ? this.translate.instant('profile.email.invalid')
          : this.translate.instant('profile.email.hint');
    }
  });

  protected readonly emailHintIsError = computed(() =>
    this.emailStatus() === 'sameEmail' || this.emailStatus() === 'taken' || this.emailStatus() === 'error' ||
    (this.emailInvalid() && this.trimmedEmailDraft().length > 0));

  ngOnInit(): void {
    if (!this.playerSession.isLinked()) {
      this.router.navigateByUrl('/login');
    }
  }

  onPseudoInput(value: string): void {
    this.pseudoDraft.set(value);
    this.pseudoStatus.set('idle');
  }

  savePseudo(): void {
    if (this.saveDisabled()) return;
    this.pseudoStatus.set('saving');
    this.playerSession.updatePseudo(this.trimmedDraft()).subscribe({
      next: () => this.pseudoStatus.set('saved'),
      error: (err) => this.pseudoStatus.set(err.status === 409 ? 'taken' : 'error'),
    });
  }

  onEmailInput(value: string): void {
    this.emailDraft.set(value);
    this.emailStatus.set('idle');
  }

  saveEmail(): void {
    if (this.emailSaveDisabled()) return;
    this.emailStatus.set('sending');
    this.playerSession.requestEmailChange(this.trimmedEmailDraft()).subscribe({
      next: () => this.emailStatus.set('sent'),
      error: (err) => {
        if (err.status === 409) this.emailStatus.set('taken');
        else if (err.status === 400) this.emailStatus.set('sameEmail');
        else this.emailStatus.set('error');
      },
    });
  }

  askLogout(): void {
    this.logoutError.set(false);
    this.showLogoutConfirm.set(true);
  }

  cancelLogout(): void {
    this.showLogoutConfirm.set(false);
  }

  confirmLogout(): void {
    this.loggingOut.set(true);
    this.logoutError.set(false);
    this.playerSession.logout().subscribe({
      next: () => {
        this.playerSession.load().subscribe(() => {
          this.loggingOut.set(false);
          this.showLogoutConfirm.set(false);
          this.router.navigateByUrl('/');
        });
      },
      error: () => {
        this.loggingOut.set(false);
        this.logoutError.set(true);
      },
    });
  }
}
