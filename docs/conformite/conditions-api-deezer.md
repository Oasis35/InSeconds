# InSeconds et les conditions de l'API Deezer

Lecture des textes de Deezer (octobre 2026). Ce n'est pas un avis juridique. Les règles qui en découlent pour le code sont résumées dans le piège 47 du [`CLAUDE.md`](../../CLAUDE.md#pièges-connus).

Sources :
- Conditions : https://developers.deezer.com/termsofuse
- Charte : https://developers.deezer.com/guidelines
- FAQ développeurs : https://support.deezer.com/hc/en-gb/articles/360011538897-Deezer-FAQs-For-Developers
- Discussion « Use Preview API for Trivia music game » (12/08/2026) : https://en.deezercommunity.com/deezer-for-creators-55/use-preview-api-for-trivia-music-game-83063
- Discussion « Can I use Deezer API for website that runs ads? » (2023) : https://en.deezercommunity.com/features-feedback-44/can-i-use-deezer-api-for-website-that-runs-ads-78072

## Verdict

Un jeu de quiz gratuit, sans publicité, qui joue les extraits de 30 s fournis par l'API est l'usage autorisé. Les deux points d'information demandés par les textes sont en place (cf. [plus bas](#ce-que-les-pages-publiques-disent)).

## Point par point

### 1. Quiz sur les extraits de 30 s, coupés à 0,5 s : conforme

Aucun texte n'interdit les jeux ni de jouer une partie de l'extrait. La charte limite l'API aux extraits : « API: 30s. extract » pour tous les profils, et « no audio streaming available except 30s extracts ». InSeconds n'utilise que ces extraits.

La discussion communauté répond à la même question (un blind test qui fait deviner l'année ou le titre) :
> « If it's not for commercial purposes, then yes, you can. Don't forget to mention that the information and audio are from Deezer, and that's all :) »

Cette réponse vient d'un membre de la communauté, pas d'un employé de Deezer : elle est cohérente avec les conditions mais ne les engage pas. Par contraste, Spotify interdit expressément les jeux et quiz dans ses conditions développeur ; Deezer ne contient rien de tel.

### 2. Lecture des extraits dans le navigateur : conforme

- **Pas de stockage** : « Local Storage/Offline Storage of audio data is strictly forbidden. » L'élément audio lit l'extrait en flux, rien n'est gardé. Ne jamais mettre l'audio dans IndexedDB, Cache Storage ou le service worker : `ngsw-config.json` n'a aucun `dataGroups`. La forme d'onde du lecteur (barres et basses qui font bouger le bouton) est calculée **une fois par morceau par l'API** (piège 50) : l'extrait est téléchargé en mémoire depuis le CDN de Deezer (jamais sur disque ni en base), décodé puis oublié ; seules des **valeurs dérivées** sont stockées dans `catalogue.tracks` (180 barres et 1800 valeurs de basses, environ 2 Ko, à partir desquelles l'audio ne peut pas être reconstitué). C'est une **zone grise** des conditions (« Local Storage/Offline Storage of audio data » vise l'audio, pas une silhouette de son énergie), assumée : le service concurrent blindtest.gg diffuse aussi une forme précalculée. À défaut de forme en base, le navigateur la calcule lui-même, en mémoire, à chaque morceau (`cache: 'no-store'`). Si Deezer le demandait, la colonne se vide et le repli navigateur reprend.
- **Pas de téléchargement** : « Except for 30s. extracts mp3s, full-length tracks URLs must never be accessible to the end-user ». Les extraits de 30 s sont exclus de cette règle : une URL d'extrait visible dans l'onglet réseau ne pose pas de problème.
- **Pas de contournement des protections** (art. V, DRM) : les extraits sont des MP3 publics servis avec `Access-Control-Allow-Origin: *`.

### 3. Attribution : conforme

- Le badge officiel « À écouter sur Deezer » et le lien vers la page Deezer de chaque morceau répondent à la demande de mentionner Deezer. Utiliser le badge tel quel, sans le modifier (les conditions intègrent les « Trademark Guidelines », art. II).
- La page `/legal` (mentions légales) a une section « Contenus musicaux » : contenus fournis par Deezer, site non affilié.

### 4. Usage non commercial : conforme, avec une nuance

Art. IV :
> « The Developer agrees that the use of the Services is strictly limited for a non-commercial purpose and in a non-commercial environment. It means that the Developer shall not perceive, receive, generate, benefit or create directly or indirectly, any moneys, incomes, revenues, data or any other consideration in connection with the use of neither the Services themselves, nor any and all Content accessed through the Services. »

- Jeu gratuit, sans publicité ni vente : conforme. La discussion de 2023 montre que la publicité suffit à rendre l'usage commercial.
- La licence PolyForm Noncommercial porte sur le code, pas sur l'usage de Deezer : ce qui compte, c'est que le site ne rapporte rien.
- Le mot « data » : les comptes et les statistiques de jeu sont des données liées au service. Elles ne sont ni vendues ni exploitées ; ne jamais les monétiser.
- Le contenu ne doit pas être « associated, directly or indirectly with any trademark, brand name, or logo » : lu comme visant les marques commerciales (sponsoring, partenaires). Ne jamais associer de marque tierce au jeu.

### 5. URL d'extrait côté serveur : conforme

Les URL d'extrait ne sont pas mises en cache (signées pour 15 min, piège 14), l'audio non plus. La FAQ autorise le stockage des métadonnées :
> « Is it possible to store artist and track names locally without stocking the audio? Yes, it is possible. »

### 6. Captures d'écran versionnées : aucune pochette

Le dépôt est public : une capture de l'app qui montrerait une pochette y stockerait une image Deezer. Les captures de `docs/**/maquettes/` se prennent pochettes remplacées par un aplat (le navigateur de capture intercepte `cdn-images.dzcdn.net`) ; le catalogue de test porte de vrais hash de pochette, une capture prise sans cette précaution les montrerait. Le badge officiel « À écouter sur Deezer » y reste, tel quel (§ 3).

**Exception assumée** : dix captures de l'ancien modèle de Survie (`maquettes/app/*.png`, retirées du dépôt depuis) ont été versées une fois avec de vraies pochettes, remplacées par un aplat au commit suivant ; elles restent dans l'historique git, qui n'est pas réécrit. Toute nouvelle capture suit la règle ci-dessus.

## Ce que les pages publiques disent

| Exigence | Texte | Où |
|---|---|---|
| Informer que l'écoute est limitée à un usage privé, dans le cadre familial | art. IV : « inform […] that the streaming of the recordings is limited to a strictly private use within a family scope » | `/legal`, section « Contenus musicaux (API Deezer) » (clé `legal.music.body`, FR et EN) |
| Dire ce que Deezer reçoit du joueur | (RGPD) | `/privacy` : le navigateur se connecte aux serveurs de Deezer dès l'ouverture de l'application (preconnect de `index.html`) puis y charge extraits et pochettes ; Deezer reçoit l'IP du joueur, même sans partie lancée ; rien d'autre ne leur est transmis (clés `privacy.*`) |

## Rappels

- Deezer peut couper l'accès à tout moment, sans préavis (art. II c). Il n'existe ni API payante ni certification.
- Quota d'environ 50 requêtes par 5 s : respecté par `catalogue-refresh` (lots de 10 toutes les 1,5 s, piège 16).
