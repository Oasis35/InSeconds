import { RenderMode, ServerRoute } from '@angular/ssr';

/** Seules ces pages sont prérendues à la construction ; toutes les autres restent rendues par le navigateur. */
export const serverRoutes: ServerRoute[] = [
  { path: '', renderMode: RenderMode.Prerender },
  { path: 'legal', renderMode: RenderMode.Prerender },
  { path: 'privacy', renderMode: RenderMode.Prerender },
  { path: '**', renderMode: RenderMode.Client },
];
