---
name: pr-staging
description: Livrer une tâche InSeconds en PR brouillon vers env/staging (branche feat/*, identité git de Clément, relectures par les sous-agents, pushes regroupés, CI suivie jusqu'au bout). À utiliser pour commiter, pousser et ouvrir ou mettre à jour la PR d'une tâche.
argument-hint: <sujet> (ex. groupes-renommage)
---

# PR vers env/staging

Argument : `$ARGUMENTS` (le sujet, qui donne le nom de branche).

## 1. Branche

- Jamais de commit sur `main` ni `env/staging` (hook `protected-branches`).
- Partir du staging à jour : `git fetch origin && git checkout -b feat/$ARGUMENTS origin/env/staging` (ou la branche imposée par la session). Une demande de suivi = un commit de plus sur la même branche.
- Une PR = son brief, rien de voisin.

## 2. Avant de commiter

- Back touché : `dotnet build InSeconds.slnx` et `dotnet test --solution InSeconds.slnx` (depuis `src/back`) ; code Wolverine régénéré si un handler a changé ; migration si une entité a changé.
- Front touché : `npx ng test --watch=false`, `npm run lint:arch` et `npm run build` (depuis `src/front/InSeconds.Client`) ; ne pas commiter si le build de prod échoue.
- Fichiers générés commités avec leur source : `Internal/Generated`, `openapi/<module>.json`, `api.generated.ts`.

## 3. Commit

Author **et** committer = Clément, posés dans la commande, jamais par `git config` ; aucune ligne `Co-Authored-By` (hook `commit-identity`) ; aucun tiret cadratin (hook `no-em-dash`).

```bash
GIT_AUTHOR_NAME="Clément" GIT_AUTHOR_EMAIL="clement.rageau@gmail.com" \
GIT_COMMITTER_NAME="Clément" GIT_COMMITTER_EMAIL="clement.rageau@gmail.com" \
git commit -m "<message en français>"
git log --format='%an <%ae> | %cn <%ce>' -1
```

En PowerShell : `$env:GIT_AUTHOR_NAME='Clément'; $env:GIT_AUTHOR_EMAIL='clement.rageau@gmail.com'; $env:GIT_COMMITTER_NAME='Clément'; $env:GIT_COMMITTER_EMAIL='clement.rageau@gmail.com'; git commit -m "..."`.

## 4. Relectures (avant « prête »)

- `relecteur-pr`, toujours.
- `gardien-code` si un module, une couche ou un port est touché ; `gardien-da` pour un écran ou un style ; `gardien-rgpd` pour un journal, une table avec `player_id`, l'export ou l'effacement.
- Leurs constats se traitent dans la même PR.

## 5. Push et PR

- **Regrouper les pushes** : la CI annule le run précédent de la branche à chaque push (`cancel-in-progress`). Commiter localement tout ce qui est prêt, puis un seul `git push -u origin feat/$ARGUMENTS`.
- PR **brouillon** vers `env/staging`, description en français (ce qui change, comment c'est testé, ce qui reste) :

  ```bash
  gh pr create --draft --base env/staging --title "<titre>" --body-file <fichier>
  ```

- Jamais de `git push --force` (refusé par les permissions) ; pour réécrire la branche de travail : `--force-with-lease`, jamais sur `main` ni `env/staging`.

## 6. CI

- Le seul check exigé est « CI OK ». Un run n'est vert que s'il est **allé au bout** : un run annulé par un push suivant ne prouve rien.
- Suivre avec `gh pr checks <numéro>` ou `gh run list --branch feat/$ARGUMENTS` ; un échec se lit avec `gh run view <id> --log-failed`.
- Un avertissement SonarCloud se traite dans la même PR.
- Sortir du brouillon seulement quand Clément le demande.
