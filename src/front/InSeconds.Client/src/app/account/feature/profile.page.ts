import { ChangeDetectionStrategy, Component, Injector, OnInit, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { FormField, FormRoot, form, validate } from '@angular/forms/signals';
import { Router, RouterLink } from '@angular/router';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { FileDownload } from '../../core/download/file-download';
import { AppError } from '../../core/errors/app-error';
import { errorMessageKey } from '../../core/errors/error-messages';
import { LanguageService } from '../../core/i18n/language.service';
import { SessionStore } from '../../core/session/session.store';
import { ButtonComponent } from '../../ui/button/button.component';
import { DecorBackgroundComponent } from '../../ui/decor-background/decor-background.component';
import { ErrorMessageComponent } from '../../ui/error-message/error-message.component';
import { ModalService } from '../../ui/modal/modal.service';
import { ToastService } from '../../ui/toast/toast.service';
import { DevicesStore } from '../data-access/devices.store';
import { ActionStatus, ProfileStore } from '../data-access/profile.store';
import { isPlausibleEmail, normalizeEmail, sameEmail } from '../domain/email';
import { normalizePseudo, pseudoIssue } from '../domain/pseudo';
import { DeviceListComponent } from '../ui/device-list.component';
import { BrowserIdComponent } from './browser-id.component';
import { DeleteAccountDialog } from './delete-account.dialog';

/** Forme de la ligne des appareils repliés selon le nombre des autres. */
function summaryKey(others: number): 'alone' | 'one' | 'many' {
  if (others === 0) return 'alone';
  return others === 1 ? 'one' : 'many';
}

function errorOf(status: ActionStatus): AppError | null {
  return typeof status === 'object' ? status.error : null;
}

/**
 * `/account/profile` : pseudo, changement d'email (confirmé par un lien envoyé à la nouvelle
 * adresse), appareils connectés (liste repliée), déconnexion, puis « Tes données » : copie de ses
 * données en JSON et suppression du compte (RGPD). Réservé aux comptes (garde de la route).
 */
@Component({
  selector: 'app-profile-page',
  imports: [
    FormField, FormRoot, RouterLink, TranslatePipe, ButtonComponent, DecorBackgroundComponent, ErrorMessageComponent,
    DeviceListComponent, BrowserIdComponent,
  ],
  providers: [ProfileStore, DevicesStore],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './profile.page.html',
})
export class ProfilePage implements OnInit {
  protected readonly session = inject(SessionStore);
  protected readonly profile = inject(ProfileStore);
  protected readonly devices = inject(DevicesStore);
  protected readonly locale = inject(LanguageService).current;
  private readonly modal = inject(ModalService);
  private readonly toast = inject(ToastService);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);
  private readonly injector = inject(Injector);
  private readonly download = inject(FileDownload);

  /** La liste des appareils, repliée à chaque visite. */
  protected readonly devicesOpen = signal(false);
  /** Ligne de la liste repliée : cet appareil et le nombre des autres. */
  protected readonly devicesSummary = computed(() => {
    if (!this.devices.isFulfilled()) return null;
    const label = this.devices.devices().find(device => device.isCurrent)?.label ?? null;
    const count = this.devices.others().length;
    return { key: `account.devices.summary.${summaryKey(count)}`, label, count };
  });

  /** Champ pseudo : mêmes règles que le back, sur la valeur sans espaces autour. */
  protected readonly pseudoForm = form(signal({ pseudo: this.session.player()?.pseudo ?? '' }), path => {
    validate(path.pseudo, ({ value }) => (pseudoIssue(value()) === null ? null : { kind: 'pseudo' }));
  });
  protected readonly emailForm = form(signal({ email: this.session.player()?.email ?? '' }), path => {
    validate(path.email, ({ value }) => (isPlausibleEmail(value()) ? null : { kind: 'email' }));
  });

  private readonly pseudoDraft = computed(() => normalizePseudo(this.pseudoForm.pseudo().value()));
  private readonly emailDraft = computed(() => normalizeEmail(this.emailForm.email().value()));

  protected readonly pseudoError = computed(() => errorOf(this.profile.pseudoStatus()));
  protected readonly emailError = computed(() => errorOf(this.profile.emailStatus()));
  protected readonly logoutError = computed(() => errorOf(this.profile.logoutStatus()));
  protected readonly exportError = computed(() => errorOf(this.profile.exportStatus()));
  protected readonly devicesActionError = computed(() => errorOf(this.devices.action()));
  protected readonly devicesActionKey = computed(() => errorMessageKey(this.devicesActionError()?.code));

  protected readonly pseudoSaveDisabled = computed(
    () => this.pseudoForm.pseudo().invalid() || this.pseudoDraft() === (this.session.player()?.pseudo ?? '')
      || this.profile.pseudoStatus() === 'pending',
  );
  protected readonly emailSaveDisabled = computed(
    () => this.emailForm.email().invalid() || sameEmail(this.emailDraft(), this.session.player()?.email)
      || this.profile.emailStatus() === 'pending',
  );

  /** Aide sous le champ pseudo : l'erreur du serveur, le succès, ou ce qui cloche dans la saisie. */
  protected readonly pseudoHint = computed(() => {
    const error = this.pseudoError();
    if (error) return { key: errorMessageKey(error.code), isError: true };
    if (this.profile.pseudoStatus() === 'done') return { key: 'account.profile.pseudo.success', isError: false };
    const issue = pseudoIssue(this.pseudoDraft());
    if (issue === 'tooShort') return { key: 'account.profile.pseudo.tooShort', isError: true };
    if (issue === 'tooLong') return { key: 'account.profile.pseudo.tooLong', isError: true };
    if (issue === 'invalid') return { key: 'account.profile.pseudo.invalid', isError: true };
    return { key: 'account.profile.pseudo.hint', isError: false };
  });

  protected readonly emailHint = computed(() => {
    const error = this.emailError();
    if (error) return { key: errorMessageKey(error.code), isError: true };
    if (this.profile.emailStatus() === 'done') return { key: 'account.profile.email.sentHint', isError: false };
    const invalid = this.emailDraft().length > 0 && !isPlausibleEmail(this.emailDraft());
    return invalid
      ? { key: 'account.profile.email.invalid', isError: true }
      : { key: 'account.profile.email.hint', isError: false };
  });

  ngOnInit(): void {
    void this.devices.load();
  }

  protected savePseudo(): void {
    if (!this.pseudoSaveDisabled()) void this.profile.savePseudo(this.pseudoDraft());
  }

  protected saveEmail(): void {
    if (!this.emailSaveDisabled()) void this.profile.requestEmailChange(this.emailDraft());
  }

  protected async logout(): Promise<void> {
    const confirmed = await this.modal.confirm({
      title: this.translate.instant('account.profile.logout.confirmTitle'),
      body: this.translate.instant('account.profile.logout.confirmBody', { email: this.session.player()?.email ?? '' }),
      confirmLabel: this.translate.instant('account.profile.logout.action'),
      cancelLabel: this.translate.instant('account.profile.logout.cancel'),
      tone: 'danger',
    });
    if (confirmed && (await this.profile.logout())) await this.router.navigateByUrl('/');
  }

  protected async revoke(id: number): Promise<void> {
    const current = this.devices.devices().find(device => device.id === id)?.isCurrent === true;
    const confirmed = await this.modal.confirm({
      title: this.translate.instant('account.devices.revokeConfirmTitle'),
      body: this.translate.instant(current ? 'account.devices.revokeCurrentConfirmBody' : 'account.devices.revokeConfirmBody'),
      confirmLabel: this.translate.instant('account.devices.revoke'),
      cancelLabel: this.translate.instant('account.devices.cancel'),
      tone: 'danger',
    });
    if (!confirmed) return;

    const outcome = await this.devices.revoke(id);
    if (outcome === 'signed-out') await this.router.navigateByUrl('/');
    else if (outcome === 'revoked') this.toast.show('account.devices.revoked', { tone: 'success' });
  }

  protected async revokeOthers(): Promise<void> {
    const confirmed = await this.modal.confirm({
      title: this.translate.instant('account.devices.revokeOthersConfirmTitle'),
      body: this.translate.instant('account.devices.revokeOthersConfirmBody'),
      confirmLabel: this.translate.instant('account.devices.revokeOthers'),
      cancelLabel: this.translate.instant('account.devices.cancel'),
      tone: 'danger',
    });
    if (confirmed && (await this.devices.revokeOthers())) this.toast.show('account.devices.revokedOthers', { tone: 'success' });
  }

  protected toggleDevices(): void {
    this.devicesOpen.update(open => !open);
  }

  /** Télécharge la copie de ses données, directement, sans fenêtre. */
  protected async downloadData(): Promise<void> {
    const file = await this.profile.exportData();
    if (file) this.download.saveText(file.fileName, file.json);
  }

  protected async deleteAccount(): Promise<void> {
    const ref = this.modal.open<boolean, unknown, DeleteAccountDialog>(DeleteAccountDialog, { injector: this.injector });
    if ((await firstValueFrom(ref.closed)) !== true) return;
    await this.router.navigateByUrl('/');
    this.toast.show('account.profile.delete.done', { tone: 'success' });
  }
}
