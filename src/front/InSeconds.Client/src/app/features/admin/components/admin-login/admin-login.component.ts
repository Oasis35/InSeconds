import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminApiService } from '../../services/admin-api.service';

@Component({
  selector: 'app-admin-login',
  imports: [FormsModule, RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.Eager,
  templateUrl: './admin-login.component.html',
})
export class AdminLoginComponent {
  private readonly api = inject(AdminApiService);

  protected password = '';
  protected readonly loginStatus = signal<'idle' | 'loading' | 'error'>('idle');

  login(): void {
    this.loginStatus.set('loading');
    this.api.login(this.password).then(() => {
      this.loginStatus.set('idle');
      this.password = '';
    }).catch(() => this.loginStatus.set('error'));
  }
}
