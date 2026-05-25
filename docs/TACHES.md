# InSeconds — Liste des Tâches (MVP)

## Backend - Setup
- [ ] Créer solution .NET 10 (`InSeconds.sln`)
- [ ] Créer Web API project (`InSeconds.Api`)
- [ ] Ajouter packages EF Core + SQL Server
- [ ] Créer structure dossiers (Controllers, Services, Data, Models)
- [ ] Créer `appsettings.json` avec connexion SQL Server
- [ ] Configurer `Program.cs` avec DI

## Modèles & Base de Données
- [ ] Créer modèle `Player.cs`
- [ ] Créer modèle `DailyChallenge.cs`
- [ ] Créer modèle `DailyChallengeTrack.cs`
- [ ] Créer modèle `GameSession.cs` (contrainte UNIQUE PlayerId+DailyChallengeId)
- [ ] Créer modèle `GameSessionAnswer.cs`
- [ ] Créer `ApplicationDbContext.cs`
- [ ] Créer migration initiale
- [ ] Exécuter migration → vérifier tables SQL Server

## Services Métier
- [ ] Implémenter `TextNormalizer.cs` (distance Levenshtein + normalisation)
- [ ] Implémenter `ScoreCalculator.cs` (1000 × décroissance temps × bonus difficulté)
- [ ] Créer stub `DeezerService.cs` (interfaces, pas HTTP encore)
- [ ] Enregistrer services dans `Program.cs`
- [ ] Tests unitaires TextNormalizer
- [ ] Tests unitaires ScoreCalculator

## Endpoints API
- [ ] Créer `SessionsController.cs`
- [ ] Implémenter `POST /api/sessions` (créer session de jeu)
  - Valider joueur existe
  - Vérifier contrainte UNIQUE (1 partie/jour par joueur)
  - Retourner session ID + métadonnées pistes
- [ ] Implémenter `POST /api/sessions/{sessionId}/answers` (soumettre réponse)
  - Valider temps écoulé (sanity check: < 500ms = suspect)
  - Calculer score côté serveur (TextNormalizer + ScoreCalculator)
  - Sauvegarder réponse en BD
  - Retourner feedback score
- [ ] Configurer CORS pour localhost:4200
- [ ] Tester endpoints (Postman ou équivalent)

## Frontend - Setup
- [ ] Créer projet Angular (`ng new InSeconds.Client`)
- [ ] Architecture standalone components
- [ ] Configurer URL API (localhost:5000/api)
- [ ] Ajouter HttpClient

## Service Audio (Critique pour UX)
- [ ] Créer `AudioPlayerService` singleton
  - signal: `state` (idle | loading | playing | stopped)
  - signal: `elapsedMs` (temps réel via requestAnimationFrame)
  - computed: `potentialScore` (décroît de 1000 à 0)
  - méthode: `play(url)` → lance audio, met à jour temps
  - méthode: `stop()` → arrête audio, retourne temps final
  - durée max: 30s (arrêt auto)
- [ ] Tester précision requestAnimationFrame
- [ ] Tester sur iOS (attribut playsinline critique)
- [ ] Tester sur Android

## Composants UI Jeu
- [ ] Créer `GameComponent` (conteneur)
  - Récupérer défi du jour à init
  - Tracker index question actuelle (0-9)
  - Afficher progression (X / 10)
  - Afficher score total accumulé
- [ ] Créer `BlindRoundComponent` (UI pour 1 piste)
  - Bouton Play (toggle play/stop)
  - Champ saisie Artiste
  - Champ saisie Titre
  - Bouton Submit
  - Afficher score potentiel en temps réel
  - Désactiver inputs pendant lecture
  - Feedback haptique au stop (navigator.vibrate)
- [ ] Flux complet: play → deviner → soumettre → piste suivante

## Leaderboard
- [ ] Créer `GET /api/leaderboard/{dailyChallengeId}` (backend)
  - Top 100 joueurs
  - Rang utilisateur (ROW_NUMBER() OVER)
  - Requête unique efficace
- [ ] Créer `LeaderboardComponent`
  - Afficher top 100
  - Position utilisateur
  - Layout responsive
  - Fonction rafraîchir

## Contraintes Mobile
- [ ] Ajouter `playsinline` sur `<audio>`
- [ ] Premier `play()` dans user gesture (click)
- [ ] Utiliser `100dvh` au lieu de `100vh`
- [ ] Inputs >= 16px (éviter auto-zoom iOS)
- [ ] `touch-action: manipulation` sur boutons
- [ ] Tester sur vrai appareil iOS (obligatoire)
- [ ] Tester sur vrai appareil Android
- [ ] Vérifier mode silencieux iOS
- [ ] CSS responsive (mobile-first)

## Authentification (Simple v1)
- [ ] Créer `AuthService` (pseudo seulement, pas OAuth)
- [ ] Valider pseudo (3-20 chars, alphanumérique + _)
- [ ] Créer `LoginComponent` (input + submit)
- [ ] Stocker pseudo en localStorage
- [ ] Auto-login au chargement page
- [ ] Pseudo envoyé dans tous les appels API
- [ ] Empêcher pseudos doublons (contrainte BD)

## Intégration Deezer
- [ ] Implémenter `DeezerService.GetTrackAsync(trackId)` (GET /track/{id})
- [ ] Implémenter `DeezerService.GetTopTracksByGenreAsync(genreId)` (GET /chart/{genreId})
- [ ] Cache mémoire pour URLs preview (gérer expiration)
- [ ] Gestion rate limit (50 req/5s)
- [ ] Gestion erreurs
- [ ] Tests unitaires

## Générateur Défi Quotidien
- [ ] Créer `DailyChallengeGeneratorService` (BackgroundService)
- [ ] Exécution à minuit UTC
- [ ] Générer 10 pistes (random seedé depuis tops Deezer)
- [ ] Snapshot rang Deezer pour scoring
- [ ] Sauvegarder en BD
- [ ] Sélection reproductible par seed
- [ ] Logging + gestion erreurs

## Tests
- [ ] Tests unitaires: TextNormalizer (cas limites)
- [ ] Tests unitaires: ScoreCalculator (tous niveaux difficulté)
- [ ] Tests intégration: SessionsController
- [ ] Tests E2E: Flux complet (créer → play → soumettre)
- [ ] Tests E2E mobile iOS + Android
- [ ] Tests cross-browser (Chrome, Safari, Firefox)
- [ ] Audit performance Lighthouse
- [ ] Vérifier contraintes BD

## Déploiement
- [ ] Build Angular prod (`ng build`)
- [ ] Compte Railway ou Azure App Service
- [ ] SQL Server production (Railway ou Azure)
- [ ] Configurer connection strings prod (secrets)
- [ ] CORS pour domaine prod
- [ ] Build + déployer API .NET
- [ ] Déployer frontend Angular (static)
- [ ] Smoke tests endpoints prod
- [ ] Monitorer logs

## Polish & Docs
- [ ] CSS styling (mobile-first, sans framework)
- [ ] Couleurs + branding InSeconds
- [ ] Messages erreur (user-friendly)
- [ ] Audit accessibilité (WCAG 2.1 AA)
- [ ] Documentation API
- [ ] Guide utilisateur
- [ ] README avec instructions déploiement
- [ ] Cleanup code (commentaires, noms)

## Launch
- [ ] Smoke test final
- [ ] Flux auth E2E
- [ ] Vérifier dispo API Deezer
- [ ] Monitorer logs jour 1
- [ ] Récupérer feedback utilisateurs
- [ ] Planner features V2 (OAuth, mode practice, stats)

---

## Dépendances Tâches

```
Backend - Setup
  ↓
Modèles & BD
  ↓
Services Métier
  ├→ Endpoints API
  └→ (Deezer peut tourner en parallèle)
  
Frontend - Setup
  ├→ Service Audio
  │   ↓
  ├→ Composants UI
  │   ├→ Leaderboard
  │   └→ Contraintes Mobile
  │   
  ├→ Authentification
  
(En parallèle)
├→ Tests
├→ Déploiement
└→ Documentation

Final: Launch
```

---

## Effort Estimé

| Groupe | Effort | Notes |
|--------|--------|-------|
| Backend - Setup | 2h | Scaffolding |
| Modèles & BD | 2h | Migrations EF Core |
| Services Métier | 3h | Levenshtein + scoring |
| Endpoints API | 3h | 2 endpoints |
| Frontend - Setup | 1h | Boilerplate |
| Service Audio | 3h | requestAnimationFrame critique |
| Composants UI | 4h | UI 10 pistes |
| Leaderboard | 2h | Fetch + affichage |
| Contraintes Mobile | 2h | Tests vrais appareils |
| Authentification | 2h | Pseudo simple |
| Deezer | 3h | HTTP + cache |
| Générateur Défi | 2h | BackgroundService |
| Tests | 4h | Unitaires + E2E |
| Déploiement | 2h | Railway/Azure |
| Polish | 2h | Styles + docs |
| **TOTAL** | **35-40h** | MVP flexible |

---

## ✅ Termine quand...

✅ Toutes tâches cochées  
✅ Déploiement production OK  
✅ Flux E2E testé sur mobile  
✅ Code en GitHub propre  

🎉 **InSeconds MVP livrés!**
