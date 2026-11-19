# Hooks Claude Code d'InSeconds

- `settings.json` (dossier parent) branche les hooks ; scripts Node sans dépendance, un hook qui plante laisse passer.
- `shell-guard.mjs` : seul hook des outils Bash et PowerShell, un processus qui enchaîne `no-em-dash`, `protected-branches`, `commit-identity`, puis `lint-before-commit` (chacun chargé à part : un module qui plante est signalé, les autres tournent) ; refuse aussi un git PowerShell qu'il ne sait pas lire (exécuteur opaque comme `Invoke-Expression`, alias, appel .NET, identité posée autrement que par `$env:NOM = ...`, sous-commande cachée dans une variable ou un splatting). C'est un filet contre l'erreur, pas une barrière : un nom de programme calculé (`& ('gi'+'t') commit`) lui échappe.
- `no-em-dash.mjs` est aussi branché seul sur Write, Edit, MultiEdit, NotebookEdit et les outils GitHub.
- `session-start.mjs` (SessionStart) : branche courante, alerte sur `main` / `env/staging`, marque « [hooks InSeconds actifs] ».
- `grafana-reminder.mjs` et `codegen-reminder.mjs` (PostToolUse) : rappels, jamais bloquants.
- `lib/shell.mjs` : lecture de l'entrée, découpage bash et PowerShell, appels à git.
- Tests : `node --test .claude/hooks/tests/hooks.test.mjs` (dépôts git jetables, pas de CI).
- Ajouter un contrôle de commande shell : un module qui exporte `check(input)` rendant `{ block, context }` ou `null`, l'ajouter à `CHECKS` de `shell-guard.mjs` (nom et chemin du module), avec ses tests.
- Ajouter un autre hook : un script lancé par `runCheck(check, '<Événement>')` (ou `runSafely`), branché dans `settings.json`, puis documenté dans `CLAUDE.md` (§ Conventions Git).
