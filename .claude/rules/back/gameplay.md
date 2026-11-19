---
paths:
  - "src/back/InSeconds.Api/Modules/Gameplay/**"
  - "src/back/tests/**/Gameplay/**"
---
# Module Gameplay

La mécanique d'un morceau, partagée par les modes : **de la logique pure, sans table, route, réglage ni accès aux données**. Point d'entrée `GameplayModule.AddGameplay()` (singletons : `IAnswerMatcher`, `ISeededShuffle`, un `IHintProvider` par niveau). Ne dépend au plus que de `Catalogue/Contracts` et ne connaît aucun mode ; les noyaux ne le voient pas (`Gameplay_NeDependQueDeCatalogueContracts_EtResteSansAccesAuxDonneesNiAuWeb`, `LesModulesDesNoyaux_NeDependentPasDeGameplay`, `CatalogueEtGameplay_NeConnaissentAucunMode`). **Tout ce qu'un mode utilise est dans `Contracts/`** ; `Domain/` ne contient que des implémentations.

- **`TrackRound`** (objet valeur immuable) : ce que la manche garde, **ni le morceau ni les points**. Le mode range l'écoute et le niveau d'indice dans sa session et reconstitue la manche (`Resume`). L'identité du morceau et le verrou du morceau en cours sont l'affaire du mode (piège 35).
- **Plancher d'écoute** (piège 35) : `Listen` garde le maximum, jamais réduit ; `Answer` refuse un palier annoncé sous le plancher (`AnswerResult.BelowFloor`). Un morceau sans extrait (jamais écouté) n'a pas de plancher.
- **Indices** : `RevealHint` refuse un niveau inconnu de la politique ou pas encore débloqué ; le niveau garde son maximum ; écouter plus ne révèle rien et ne remet rien à zéro. Le niveau ne vient jamais du client. `HintFacts.UpTo` est cumulatif. Un indice de plus = un `IHintProvider` de plus, sans toucher à `TrackRound`.
- **`HintPolicy`** propre à chaque mode : seuils strictement positifs et croissants (refusé sinon) ; `HintPolicy.None` pour un mode sans indice.
- **`RoundOutcome`** : artiste et titre corrigés séparément ; le titre est juste s'il égale `Title` ou l'un des titres alternatifs (`TrackNames`) ; **aucun point** (le barème est au mode).
- **`FuzzyAnswerMatcher`** : casse, accents, parenthèses, ponctuation et mots vides ignorés, puis Levenshtein borné à min(2, longueur de la **référence** ÷ 3) (allonger la saisie ne gonfle pas la tolérance). Saisie de plus de `MaxInputLength` (600) refusée sans être lue (coût quadratique), distance non calculée si l'écart de longueur dépasse déjà le seuil.
- **`FisherYatesShuffle`** : ordre **stable** pour une graine et une liste, testé contre un ordre épinglé : changer l'algorithme changerait les morceaux d'une date déjà annoncée. `Random(graine)` est voulu (la graine du Daily est publique). La liste reçue n'est pas modifiée.
