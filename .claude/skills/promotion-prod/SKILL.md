---
name: promotion-prod
description: Promouvoir le staging en prod (PR env/staging vers main, fusion par merge commit, déploiement suivi). Seulement sur demande explicite de Clément.
argument-hint: (aucun)
disable-model-invocation: true
---

# Promotion env/staging vers main

La prod se déploie seule à chaque push sur `main` (job `deploy`, après « CI OK »). Cette skill ne se lance que sur la demande de Clément.

## 1. Ce qui part

```bash
git fetch origin
git log --oneline --first-parent origin/main..origin/env/staging
```

Lister les PR fusionnées dans `env/staging` depuis la dernière promotion (numéro et titre), et signaler celles qui demandent un geste manuel au déploiement (Caddy, `deploy/infra`, migration lourde, réglage à poser, tableau Grafana à réimporter).

## 2. La PR

- Le staging doit avoir un « CI OK » vert sur son dernier commit : `gh run list --branch env/staging -L 3`.
- Ouvrir la PR depuis `env/staging` directement (pas de branche intermédiaire) :

  ```bash
  gh pr create --base main --head env/staging --title "Promotion env/staging vers main : <résumé>" --body-file <fichier>
  ```

  Corps en français : la liste des PR promues, les gestes manuels, les risques.

## 3. Fusion

- **Merge commit, jamais squash ni rebase** : un squash crée des conflits à la promotion suivante.

  ```bash
  gh pr merge <numéro> --merge
  ```

- Seulement après le « go » explicite de Clément sur cette PR, et quand « CI OK » est vert sur la PR.

## 4. Après

- Suivre le run de `main` jusqu'au bout (`gh run list --branch main -L 1`, puis `gh run view <id>`) : job `deploy`, test de fumée, santé.
- Un correctif urgent poussé directement sur `main` doit être remergé dans `env/staging` ensuite.
- La ligne « dernier merge `env/staging` vers `main` » de `CLAUDE.md` (§ État du dépôt) est à mettre à jour dans une PR de doc.
