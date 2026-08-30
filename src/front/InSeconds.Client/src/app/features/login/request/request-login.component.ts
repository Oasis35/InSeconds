import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, Router } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { DecorBackgroundComponent } from '../../../shared/decor-background/decor-background.component';
import { ApiClient } from '../../../api/api.generated';
import { PlayerSessionService } from '../../../core/services/player-session.service';
import { environment } from '../../../../environments/environment';

// Écran /login : demande d'un lien de connexion par email (whitelist admin).
// Toujours le même message générique après soumission (jamais d'info sur
// l'existence de l'email — cohérent avec le comportement back).
@Component({
  selector: 'app-request-login',
  imports: [FormsModule, RouterLink, TranslatePipe, DecorBackgroundComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './request-login.component.html',
})
export class RequestLoginComponent {
  private readonly api = inject(ApiClient);
  private readonly playerSession = inject(PlayerSessionService);
  private readonly router = inject(Router);

  // `!environment.production` seul ne suffit pas : la config e2e/e2e-ci a aussi
  // production=false (apiUrl vide, proxy Angular) mais /api/auth/dev-login n'y est
  // jamais monté (IsDevelopment() uniquement côté back, jamais Testing) — un vrai
  // dev local a un apiUrl non vide (environment.development.ts).
  protected readonly showDevLogin = !environment.production && !!environment.apiUrl;
  protected readonly devEmails = ['user1@dev.local', 'user2@dev.local', 'user3@dev.local'];

  protected email = '';
  protected readonly status = signal<'idle' | 'sending' | 'sent' | 'invalid'>('idle');
  protected readonly devLoginStatus = signal<'idle' | 'loading' | 'error'>('idle');

  submit(): void {
    const trimmed = this.email.trim();
    if (!trimmed || !trimmed.includes('@')) {
      this.status.set('invalid');
      return;
    }

    this.status.set('sending');
    this.api.apiAuthMagicLinkRequest({ email: trimmed }).subscribe({
      next: () => this.status.set('sent'),
      // Même message générique en cas d'erreur réseau que succès — pas de fuite d'info.
      error: () => this.status.set('sent'),
    });
  }

  devLogin(devEmail: string): void {
    this.devLoginStatus.set('loading');
    this.api.apiAuthDevLogin({ email: devEmail }).subscribe({
      next: () => {
        this.playerSession.load().subscribe(() => {
          this.router.navigateByUrl('/');
        });
      },
      error: () => this.devLoginStatus.set('error'),
    });
  }
}
