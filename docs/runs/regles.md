# Run (Platines) : règles du proto 1

Règles validées par Clément le 17/10/2026. Les écrans qui les montrent : [`ecrans.md`](ecrans.md). Leur traduction technique : [`conception.md`](conception.md). Les seuils et la difficulté seront réglés après les parties de test (tout est réglable à chaud, cf. [Réglages](#réglages)).

## La playlist

À l'écran, un défi s'appelle une **playlist** (Clément, 18/10) ; le code garde `challenge`.

- Une playlist = **4 manches de 5 morceaux** (20 morceaux), tirés et enregistrés **à la création de la playlist**, sans doublon, dans **tout le catalogue jouable**, morceaux du Daily compris.
- **Difficulté croissante** : le catalogue est trié par rang Deezer et coupé en 4 tranches, une par manche (manche 1 = les morceaux les plus connus). Un morceau sans rang va dans la tranche la moins connue.
- Les règles (manches, seuils, multiplicateurs…) sont **figées dans la playlist** à sa création : un réglage changé ensuite ne touche pas une playlist existante, ni la partie d'un ami qui le relève plus tard.
- **Runs illimités** : un joueur autorisé lance autant de runs qu'il veut. Chaque run est une nouvelle playlist.

## Un morceau

1. Le son démarre **au clic** (iPhone) : « Commencer » pour le premier morceau, « Morceau suivant » pour les autres.
2. **Écoute fixe de 10 s**, d'un seul tenant (pas de paliers comme au Daily, pas d'« écouter plus »). La relecture du lecteur du Daily reste possible : pas de limite de réécoute au proto 1.
3. Le joueur tape **« Artiste - Titre »** dans un seul champ, avec l'autocomplétion Deezer du Daily, puis **Valider**. Valider un champ vide demande une confirmation.
4. **Passer** donne 0 point, après confirmation.
5. **Pas d'indice, pas de chrono** : la partie se joue à l'honneur, comme sur Bandle ou Heardle (décidé le 17/10). Un chrono ne viendra que si les parties de test montrent des abus.
6. **La réponse s'affiche aussitôt** dans l'écran de la manche : pochette, artiste et titre, ce qui était juste (artiste, titre), les points gagnés, la jauge qui avance. Le joueur passe au morceau suivant quand il veut.

## Les points

- **Points d'un morceau = (50 si l'artiste est juste + 50 si le titre est juste) × multiplicateur de la manche**, arrondi au plus proche sur le total du morceau. Artiste et titre sont corrigés séparément, avec la même tolérance qu'au Daily.
- Multiplicateur, le même pour toute une manche : **×1 ; ×1,33 ; ×1,67 ; ×2**. Le joueur ne le voit pas à l'écran : il le voit dans les points gagnés.
- Maximum par manche : 500, 665, 835, 1 000, soit **3 000** pour une playlist.
- Un morceau est **trouvé** quand l'artiste et le titre sont justes (c'est ce que compte « 16 / 20 morceaux trouvés » à la fin).

## La jauge

- Chaque manche a un **objectif** : un pourcentage du maximum de la manche, **40, 50, 60 puis 70 %**, soit 200, 333, 501 et 700 points. Le score de la manche doit l'atteindre (`>=`) pour **débloquer la manche suivante**.
- La jauge se remplit à chaque réponse. Pleine avant la fin de la manche, on joue quand même les morceaux restants : **la jauge ne sert qu'à passer, ce qui compte ce sont les points** (Clément, 17/10).
- **Morceau sans extrait** (Deezer l'a retiré depuis le tirage) : **neutralisé** par le serveur. Il ne rapporte rien et sort du maximum de la manche ; l'objectif se recalcule sur les morceaux restants. Une manche entièrement neutralisée est passée. Une panne passagère de Deezer ne neutralise pas : le joueur réessaie.

## La fin

- À la fin de chaque manche, un écran fait le bilan : manche suivante débloquée ou non, les 5 morceaux, le score total.
- **Jauge non remplie à la fin d'une manche = fin du run** (défaite). Les manches suivantes ne se jouent pas.
- **4 manches passées = victoire**.
- Score final = total des points de toutes les manches jouées.
- **Disque obtenu** = nombre de manches passées :

| Manches passées | Disque |
|---|---|
| 0 | Disque rayé |
| 1 | Disque de cire |
| 2 | Disque de bronze |
| 3 | Disque d'argent |
| 4 (victoire du proto 1) | Disque d'or |

La suite de l'échelle est prévue pour quand un run aura plus de 4 manches : platine, diamant, cristal, lunaire, cosmique, puis cosmique ★2, ★3… (au-delà de la liste, le dernier disque prend une étoile de plus).

- **Record** : meilleur score et meilleur disque, par joueur (invité compris). L'écran de fin dit « Nouveau record » ou rappelle le record.
- **Abandon** : possible à tout moment pendant une manche (lien « Abandonner », comme au Daily). Une partie abandonnée est finie.
- **Interruption** : une partie en cours se reprend au morceau en cours (même verrou anti-triche que le Daily).

## La playlist partagée

- Chaque run a un lien : **`inseconds.cc/runs/K7Q2M9`** (code de 6 caractères sans caractère ambigu, saisie insensible à la casse). Il se partage depuis l'écran de fin (« Partager la playlist »).
- Tous ceux qui ouvrent le lien jouent **les mêmes 20 morceaux, dans le même ordre**, **une seule fois** chacun, sans compte obligatoire (un invité est créé comme au Daily).
- Les 20 morceaux sont tirés dès le départ : un ami peut aller plus loin que l'auteur de la playlist si celui-ci a perdu avant la fin.
- **Comparaison** : après avoir fini sa partie, chacun voit toutes les parties terminées sur cette playlist, manche par manche, avec le pseudo de chacun (« Invité » pour un invité), son disque et son total. **Ce n'est pas un classement général** : seuls ceux qui ont le lien la voient, et la page de confidentialité le dit.

## L'accès pendant le proto

- **Sur invitation** : Platines n'est ouvert qu'aux comptes que Clément autorise, par un interrupteur dans l'onglet Joueurs de l'admin. Les admins ont l'accès d'office. Un invité sans compte n'y a pas accès. L'interrupteur est distinct du rôle admin (qui reste posé en SQL seulement).
- Sans accès, rien ne change pour le joueur : pas de carte Platines sur l'accueil, et l'adresse `/runs` renvoie vers le Daily.
- **Lien reçu** : un ami sans accès qui ouvre le lien d'une playlist peut jouer **cette playlist-là seulement**, invité compris. À la fin, il ne voit pas « Nouvelle partie » mais une invitation à jouer au Daily.
- Retirer l'accès n'interrompt pas une partie en cours ; cela empêche seulement d'en lancer une nouvelle.

## Réglages

Tous relus à chaud (`Runs:…` dans `infra.settings`), contrôlés au démarrage de l'API et à l'usage : nombre de manches (4), morceaux par manche (5), durée d'écoute (10 s), objectifs en pourcentage (40, 50, 60, 70), multiplicateurs minimum et maximum (×1 et ×2), échelle des disques.

## Ce qui n'est pas dans le proto 1

Bonus et contraintes, thèmes et genres en jeu, fantôme, mode infini, classement, série, statistiques dans l'admin, accueil à deux modes. Cf. [`plan.md`](plan.md).
