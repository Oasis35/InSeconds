---
name: Brief de tâche
about: Brief court pour démarrer un fil de travail (Claude ou humain)
title: ""
labels: ""
assignees: ""
---

<!-- Une dizaine de lignes suffit. Un champ vide prend la valeur par défaut indiquée. -->

**Objectif** : une phrase, le résultat attendu et pourquoi.

**Nature** : correctif (codable tout de suite) | nouveauté ou UI (propositions et maquettes mobiles d'abord, pas de code sans « go » explicite).

**Fichiers ou modules touchés** : chemins ou modules, et ceux qui ne doivent pas bouger.

**À ne pas changer** : comportements, codes d'erreur publiés, règles du CLAUDE.md concernées.

**Données joueur et journaux** : nouvelle table avec `player_id` (effacement et export) ? journal ou métrique lu par Grafana ? Défaut : aucun.

**Livraison** : branche puis PR brouillon vers `env/staging`, un suivi = un commit de plus. Défaut : celle-ci.

**Tests et doc** : tests à lancer (back, Vitest, E2E, `lint:arch`) et doc à mettre à jour. Défaut : ceux que couvre le CLAUDE.md pour les fichiers touchés.

**Revue avant « prêt »** : `relecteur-pr` et les gardiens concernés (code, da, rgpd). Défaut : `relecteur-pr`.

**Critère de fin** : comment Clément le vérifie sur le staging.
