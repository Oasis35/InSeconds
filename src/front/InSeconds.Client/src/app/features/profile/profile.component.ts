import { Component, ChangeDetectionStrategy, OnInit, inject, signal, computed } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { DecorBackgroundComponent } from '../../shared/decor-background/decor-background.component';
import { ConfirmSheetComponent } from '../../shared/confirm-sheet/confirm-sheet.component';
import { PlayerSessionService } from '../../core/services/player-session.service';

type PseudoStatus = 'idle' | 'saving' | 'saved' | 'taken' | 'error';

@Component({
  selector: 'app-profile',
  imports: [FormsModule, RouterLink, TranslatePipe, DecorBackgroundComponent, ConfirmSheetComponent],
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

  protected pseudoDraft = signal(this.playerSession.pseudo() ?? '');
  protected readonly pseudoStatus = signal<PseudoStatus>('idle');
  protected readonly showLogoutConfirm = signal(false);
  protected readonly loggingOut = signal(false);

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

  askLogout(): void {
    this.showLogoutConfirm.set(true);
  }

  cancelLogout(): void {
    this.showLogoutConfirm.set(false);
  }

  confirmLogout(): void {
    this.loggingOut.set(true);
    this.playerSession.logout().subscribe(() => {
      this.playerSession.load().subscribe(() => {
        this.loggingOut.set(false);
        this.showLogoutConfirm.set(false);
        this.router.navigateByUrl('/');
      });
    });
  }
}
