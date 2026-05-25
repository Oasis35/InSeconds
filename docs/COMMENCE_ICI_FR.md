# InSeconds 🎵⏱️ — COMMENCE ICI

## Ton Projet: **InSeconds**
*Blind test musical quotidien. Écoute 1-30 secondes, devine artiste + titre. Moins tu écoutes, plus tu marques. Même défi pour tout le monde, chaque jour.*

---

## ✅ Tout est Prêt

Je t'ai préparé:

### 📖 Documentation (Française)
1. **[TACHES.md](computer://C:\Users\CLRA\AppData\Roaming\Claude\local-agent-mode-sessions\c38c0fd0-a7e3-435b-8992-6989092a1a35\515c549f-a4fc-409d-98e4-14aabdb08c3d\local_b71e5312-9b1b-41c5-b91c-a8ff4c97ca69\outputs\in3secs\TACHES.md)** ⭐ — Liste complète des tâches MVP
2. **[BACKEND_STRUCTURE_FR.md](computer://C:\Users\CLRA\AppData\Roaming\Claude\local-agent-mode-sessions\c38c0fd0-a7e3-435b-8992-6989092a1a35\515c549f-a4fc-409d-98e4-14aabdb08c3d\local_b71e5312-9b1b-41c5-b91c-a8ff4c97ca69\outputs\in3secs\BACKEND_STRUCTURE_FR.md)** — Architecture .NET 10
3. **[FRONTEND_STRUCTURE_FR.md](computer://C:\Users\CLRA\AppData\Roaming\Claude\local-agent-mode-sessions\c38c0fd0-a7e3-435b-8992-6989092a1a35\515c549f-a4fc-409d-98e4-14aabdb08c3d\local_b71e5312-9b1b-41c5-b91c-a8ff4c97ca69\outputs\in3secs\FRONTEND_STRUCTURE_FR.md)** — Architecture Angular 19+
4. [docker-compose.yml](computer://C:\Users\CLRA\AppData\Roaming\Claude\local-agent-mode-sessions\c38c0fd0-a7e3-435b-8992-6989092a1a35\515c549f-a4fc-409d-98e4-14aabdb08c3d\local_b71e5312-9b1b-41c5-b91c-a8ff4c97ca69\outputs\in3secs\docker-compose.yml) — SQL Server local

### 🔧 Stack Tech (À Jour)
| Couche | Tech |
|--------|------|
| **Backend** | .NET 10 |
| **Frontend** | Angular 19+ (standalone + signals) |
| **Base de Données** | SQL Server (Docker) |
| **Musique** | API Deezer (publique) |
| **Déploiement** | Railway ou Azure App Service |

---

## 🎯 Les 14 Tâches

**Backend Core:**
1. Backend: .NET 10 solution setup + DbContext + migrations
2. Services: TextNormalizer + ScoreCalculator + stubs
3. API: SessionsController endpoints

**Frontend Core:**
4. Frontend: Angular setup + project structure
5. Audio: Implement AudioPlayerService with signals
6. UI: GameComponent + BlindRoundComponent

**Features:**
7. Leaderboard: API endpoint + Component
8. Mobile: Constraints + testing
9. Auth: Simple pseudo system
10. Deezer: Implement API wrapper + caching
11. Challenge: Daily challenge generator (BackgroundService)

**Finish:**
12. Testing: Unit + Integration + E2E tests
13. Deployment: Railway ou Azure setup
14. Polish: Styling + Accessibility + Docs

---

## 🚀 Par Où Commencer ?

1. **Ouvre [TACHES.md](computer://C:\Users\CLRA\AppData\Roaming\Claude\local-agent-mode-sessions\c38c0fd0-a7e3-435b-8992-6989092a1a35\515c549f-a4fc-409d-98e4-14aabdb08c3d\local_b71e5312-9b1b-41c5-b91c-a8ff4c97ca69\outputs\in3secs\TACHES.md)** (5 min) pour voir toutes les tâches

2. **Commence par les tâches Backend Core** (1 → 2 → 3)
   - Refer à [BACKEND_STRUCTURE_FR.md](computer://C:\Users\CLRA\AppData\Roaming\Claude\local-agent-mode-sessions\c38c0fd0-a7e3-435b-8992-6989092a1a35\515c549f-a4fc-409d-98e4-14aabdb08c3d\local_b71e5312-9b1b-41c5-b91c-a8ff4c97ca69\outputs\in3secs\BACKEND_STRUCTURE_FR.md) pour code stubs

3. **Puis Frontend Core** (4 → 5 → 6)
   - Refer à [FRONTEND_STRUCTURE_FR.md](computer://C:\Users\CLRA\AppData\Roaming\Claude\local-agent-mode-sessions\c38c0fd0-a7e3-435b-8992-6989092a1a35\515c549f-a4fc-409d-98e4-14aabdb08c3d\local_b71e5312-9b1b-41c5-b91c-a8ff4c97ca69\outputs\in3secs\FRONTEND_STRUCTURE_FR.md) pour code stubs

4. **Autres tâches peuvent tourner en parallèle** (7-14)

---

## ⚡ Quick Start Commands

Quand t'es prêt à coder:

```bash
# Backend (.NET 10)
dotnet new sln -n InSeconds
dotnet new webapi -n InSeconds.Api
cd InSeconds.Api
dotnet add package Microsoft.EntityFrameworkCore.SqlServer
dotnet ef database update

# Frontend (Angular 19+)
ng new InSeconds.Client --skip-git --routing
cd InSeconds.Client
npm install
npm start

# Database
docker-compose up -d  # SQL Server sur localhost:1433
```

**Tous les détails sont dans les fichiers architecture.**

---

## 📊 Effort Total

- **35-40 heures** de travail au total (MVP flexible)
- Pas de deadline par weekends — juste des tâches atomiques
- Fait à ton rythme!

---

## ✨ Specs Clés

**Gameplay:**
- 10 morceaux par jour (même pour tout le monde)
- Max 30s d'écoute par morceau
- Score = 1000 × (1 - temps/30) × bonus difficulté × pénalité partielle
- Moins tu écoutes = plus tu marques ✓

**Anti-Triche:**
- Scoring côté serveur seulement
- Contrainte UNIQUE (PlayerId, DailyChallengeId) → 1 partie/jour max
- Sanity checks sur les temps

**Mobile:**
- playsinline sur audio (iOS critique)
- 100dvh viewport, inputs >= 16px
- Touch-action manipulation
- Tests sur vrais appareils

---

## 📋 Prochaines Étapes

1. **Maintenant:** Lis [TACHES.md](computer://C:\Users\CLRA\AppData\Roaming\Claude\local-agent-mode-sessions\c38c0fd0-a7e3-435b-8992-6989092a1a35\515c549f-a4fc-409d-98e4-14aabdb08c3d\local_b71e5312-9b1b-41c5-b91c-a8ff4c97ca69\outputs\in3secs\TACHES.md) (5 min)

2. **Tâche 1:** Ouvre [BACKEND_STRUCTURE_FR.md](computer://C:\Users\CLRA\AppData\Roaming\Claude\local-agent-mode-sessions\c38c0fd0-a7e3-435b-8992-6989092a1a35\515c549f-a4fc-409d-98e4-14aabdb08c3d\local_b71e5312-9b1b-41c5-b91c-a8ff4c97ca69\outputs\in3secs\BACKEND_STRUCTURE_FR.md) et commence

3. **Tâches suivantes:** Check [TACHES.md](computer://C:\Users\CLRA\AppData\Roaming\Claude\local-agent-mode-sessions\c38c0fd0-a7e3-435b-8992-6989092a1a35\515c549f-a4fc-409d-98e4-14aabdb08c3d\local_b71e5312-9b1b-41c5-b91c-a8ff4c97ca69\outputs\in3secs\TACHES.md) et référence docs appropriées

---

## 🔥 Stack Exactement Pour Toi

✅ .NET 10 (tu maîtrises)  
✅ Angular 19+ standalone + signals (tu maîtrises)  
✅ SQL Server sur Docker (tu maîtrises)  
✅ Pas de complexité inutile (MVP pur)  
✅ Déployable facilement (Railway/Azure)  

---

**Bon courage Clément! InSeconds t'attend! 🎵🚀**

Fichiers disponibles:
- [TACHES.md](computer://C:\Users\CLRA\AppData\Roaming\Claude\local-agent-mode-sessions\c38c0fd0-a7e3-435b-8992-6989092a1a35\515c549f-a4fc-409d-98e4-14aabdb08c3d\local_b71e5312-9b1b-41c5-b91c-a8ff4c97ca69\outputs\in3secs\TACHES.md) — Tâches complètes
- [BACKEND_STRUCTURE_FR.md](computer://C:\Users\CLRA\AppData\Roaming\Claude\local-agent-mode-sessions\c38c0fd0-a7e3-435b-8992-6989092a1a35\515c549f-a4fc-409d-98e4-14aabdb08c3d\local_b71e5312-9b1b-41c5-b91c-a8ff4c97ca69\outputs\in3secs\BACKEND_STRUCTURE_FR.md) — Backend
- [FRONTEND_STRUCTURE_FR.md](computer://C:\Users\CLRA\AppData\Roaming\Claude\local-agent-mode-sessions\c38c0fd0-a7e3-435b-8992-6989092a1a35\515c549f-a4fc-409d-98e4-14aabdb08c3d\local_b71e5312-9b1b-41c5-b91c-a8ff4c97ca69\outputs\in3secs\FRONTEND_STRUCTURE_FR.md) — Frontend
- [docker-compose.yml](computer://C:\Users\CLRA\AppData\Roaming\Claude\local-agent-mode-sessions\c38c0fd0-a7e3-435b-8992-6989092a1a35\515c549f-a4fc-409d-98e4-14aabdb08c3d\local_b71e5312-9b1b-41c5-b91c-a8ff4c97ca69\outputs\in3secs\docker-compose.yml) — SQL Server
