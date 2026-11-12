import { Routes } from '@angular/router';
import { provideSocialApi } from '../data-access/social.providers';
import { JoinGroupPage } from './join-group/join-group.page';
import { NewGroupPage } from './new-group/new-group.page';
import { RankingPage } from './ranking/ranking.page';

/**
 * Le classement entre amis, chargé à la demande avec son client d'API : le classement de mes groupes (`/ranking`, `?group=<id>`), la création
 * d'un groupe (`/ranking/new`) et le lien d'invitation (`/ranking/join/<code>`). Le serveur décide de tout : un groupe exige un compte, seuls
 * ses membres le lisent.
 */
export const SOCIAL_ROUTES: Routes = [
  {
    path: '',
    providers: [provideSocialApi()],
    children: [
      { path: '', component: RankingPage },
      { path: 'new', component: NewGroupPage },
      { path: 'join/:code', component: JoinGroupPage },
    ],
  },
];
