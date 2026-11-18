---
name: nouveau-reglage
description: Ajouter un réglage modifiable à chaud dans InSeconds (table infra.settings, options d'un module lues par IOptionsMonitor). À utiliser quand une valeur du jeu doit pouvoir changer sans redéploiement.
argument-hint: <Module>:<Clé> <défaut> (ex. Social:MaxInvitesPerDay 20)
---

# Nouveau réglage

Argument : `$ARGUMENTS`. Référence : `src/back/CLAUDE.md` § Réglages ; modèle : `SocialOptions` et `SocialRules` (`src/back/InSeconds.Api/Modules/Social/Application/SocialSupport.cs`), `DailyOptions` pour les listes.

## Règles

- Un réglage = **une propriété** dans la classe d'options du module (`<Module>Options`, section `"<Module>"`, liée par `services.AddOptions<…>().BindConfiguration(…Options.Section)` dans `<Module>Module.cs`), avec sa valeur par défaut en constante (`Default…`). Aucune ligne en base n'est nécessaire.
- La clé en base est le chemin complet (`Social:MaxGroupsPerPlayer`), valeur en `jsonb`.
- **Lu à chaud** : toujours par `IOptionsMonitor<T>.CurrentValue` au moment de l'usage (jamais `IOptions<T>`, jamais copié dans un singleton au démarrage). Le plus simple : une classe de règles injectée (`SocialRules`) qui lit `CurrentValue` à chaque appel.
- **Bornes** : une valeur hors bornes (écrite à la main en base) retombe sur le défaut sans empêcher le jeu (`InRange(...)` de `SocialRules`), ou fait refuser le démarrage si elle rend le jeu incohérent (`DailyOptionsStartupCheck`).
- **Liste ou dictionnaire : pas de valeur initiale** sur la propriété (le binder ajouterait les éléments lus aux éléments par défaut). Propriété nue, et une propriété `Effective…` qui rend le défaut quand la liste est vide ; le code ne lit que `Effective…` (cf. `DailyOptions.EffectiveAllowedDurationsSeconds`).
- **Pas de clé de dictionnaire décimale** (le binder laisse le dictionnaire vide sans erreur) : une liste d'objets à la place (`DurationScores`).
- Un réglage figé dans une partie (règles d'une playlist Survie) se copie dans l'entité à sa création ; il n'est alors plus relu à chaud pour cette partie.

## Écrire et tester

- Écriture par le code (admin) : `SettingsStore.SetAsync(key, value)` ; après une écriture SQL directe : `ISettingsReloader.Reload()`.
- Tests : défaut sans ligne en base, valeur relue à chaud après `SetAsync`, valeur hors bornes. Exemples : `IntegrationTests/SettingsTests.cs`, `Runs/RunsSettingsTests`.
- Si le réglage passe par un endpoint admin : skill `nouvel-endpoint`.

## Documentation

Le tableau des réglages de `CLAUDE.md` (racine) liste chaque clé, son défaut et ses bornes : à compléter dans la même PR.
