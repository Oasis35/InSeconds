import { Component, inject, ChangeDetectionStrategy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { TranslatePipe } from '@ngx-translate/core';
import { PlayerSessionService } from '../../../../core/services/player-session.service';

@Component({
  selector: 'app-admin-login',
  imports: [RouterLink, TranslatePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './admin-login.component.html',
})
export class AdminLoginComponent {
  private readonly playerSession = inject(PlayerSessionService);

  // Deux cas distincts derrière ce même écran : pas de compte lié (guest ou pas
  // connecté) → lien vers /login ; compte lié mais IsAdmin=false → simple message,
  // pas d'action possible depuis l'UI (cf. features/admin/CLAUDE.md).
  protected readonly isLinked = this.playerSession.isLinked;
}
