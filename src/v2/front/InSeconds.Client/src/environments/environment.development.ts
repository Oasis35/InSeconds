export const environment = {
  // Nom de l'environnement : 'staging' affiche le bandeau DEV (EnvBannerComponent).
  name: 'development',
  production: false,
  // Vide en dev : les appels passent par le proxy d'`ng serve` (proxy.conf.json → API v2 :5175).
  apiUrl: '',
  appUrl: 'http://localhost:5176',
};
