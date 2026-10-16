import { Routes } from '@angular/router';
import { linkedAccountGuard } from './account.guards';
import { ConfirmEmailPage } from './confirm-email.page';
import { LoginPage } from './login.page';
import { ProfilePage } from './profile.page';
import { VerifyPage } from './verify.page';

/**
 * Routes du domaine `account`, chargées à la demande (`/account/...`). Chaque page fournit ses
 * propres stores. Les anciennes adresses de la v1 (`/login`, `/profile`…) sont redirigées par
 * `app.routes.ts`, en gardant la query string.
 */
export const ACCOUNT_ROUTES: Routes = [
  { path: '', pathMatch: 'full', redirectTo: 'profile' },
  { path: 'login', component: LoginPage },
  { path: 'login/verify', component: VerifyPage },
  { path: 'confirm-email', component: ConfirmEmailPage },
  { path: 'profile', component: ProfilePage, canActivate: [linkedAccountGuard] },
];
