import { Component, inject, signal, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { HttpErrorResponse } from '@angular/common/http';
import { TranslatePipe } from '@ngx-translate/core';
import { AdminApiService } from '../../services/admin-api.service';

@Component({
  selector: 'app-admin-login',
  imports: [FormsModule, RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-login.component.html',
})
export class AdminLoginComponent {
  private readonly api = inject(AdminApiService);

  protected password = '';
  protected readonly loginStatus = signal<'idle' | 'loading' | 'error' | 'rate_limited'>('idle');

  login(): void {
    this.loginStatus.set('loading');
    this.api.login(this.password).then(() => {
      this.loginStatus.set('idle');
      this.password = '';
    }).catch((err: unknown) => {
      // Distinguer le 429 (rate limiter admin-login) du 401 (vrai mauvais mot de passe) —
      // sinon un simple dépassement de quota (cf. piège 27 CLAUDE.md racine) s'affiche comme
      // "mot de passe incorrect" et fait perdre du temps à chercher un problème inexistant.
      const isRateLimited = err instanceof HttpErrorResponse && err.status === 429;
      this.loginStatus.set(isRateLimited ? 'rate_limited' : 'error');
    });
  }
}
