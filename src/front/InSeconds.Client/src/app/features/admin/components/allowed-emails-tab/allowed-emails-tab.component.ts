import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { DatePipe } from '@angular/common';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminAllowedEmailsService } from '../../services/admin-allowed-emails.service';
import { ConfirmSheetComponent } from '../../../../shared/confirm-sheet/confirm-sheet.component';
import { AllowedEmailDto } from '../../../../api/api.generated';

@Component({
  selector: 'app-allowed-emails-tab',
  imports: [DatePipe, TranslatePipe, ConfirmSheetComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './allowed-emails-tab.component.html',
})
export class AllowedEmailsTabComponent {
  protected readonly allowedEmails = inject(AdminAllowedEmailsService);

  protected newEmail = '';
  protected readonly deleteTarget = signal<AllowedEmailDto | null>(null);

  add(): void {
    const trimmed = this.newEmail.trim();
    if (!trimmed) return;
    this.allowedEmails.add(trimmed);
    this.newEmail = '';
  }

  openDeleteConfirm(entry: AllowedEmailDto): void {
    this.deleteTarget.set(entry);
  }

  cancelDelete(): void {
    this.deleteTarget.set(null);
  }

  confirmDelete(): void {
    const target = this.deleteTarget();
    if (!target) return;
    this.allowedEmails.remove(target.id);
    this.deleteTarget.set(null);
  }
}
