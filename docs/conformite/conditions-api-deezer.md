# InSeconds et les conditions de l'API Deezer

Lecture des textes faite le 02/10/2026, mise à jour le 17/10/2026. Ce n'est pas un avis juridique. Les règles qui en découlent pour le code sont résumées dans le piège 47 du [`CLAUDE.md`](../../CLAUDE.md#pièges-connus).

Sources :
- Conditions : https://developers.deezer.com/termsofuse
- Charte : https://developers.deezer.com/guidelines
- FAQ développeurs : https://support.deezer.com/hc/en-gb/articles/360011538897-Deezer-FAQs-For-Developers
- Discussion « Use Preview API for Trivia music game » (12/08/2026) : https://en.deezercommunity.com/deezer-for-creators-55/use-preview-api-for-trivia-music-game-83063
- Discussion « Can I use Deezer API for website that runs ads? » (2023) : https://en.deezercommunity.com/features-feedback-44/can-i-use-deezer-api-for-website-that-runs-ads-78072

## Verdict

Un jeu de quiz gratuit, sans publicité, qui joue les extraits de 30 s fournis par l'API est l'usage autorisé. Les trois écarts relevés le 02/10/2026 sont corrigés (cf. [plus bas](#écarts-relevés-le-02102026-tous-corrigés)).

## Point par point

### 1. Quiz sur les extraits de 30 s, coupés à 0,5 s : conforme

Aucun texte n'interdit les jeux ni de jouer une partie de l'extrait. La charte limite l'API aux extraits : « API: 30s. extract » pour tous les profils, et « no audio streaming available except 30s extracts ». InSeconds n'utilise que ces extraits.

La discussion communauté répond à la même question (un blind test qui fait deviner l'année ou le titre) :
> « If it's not for commercial purposes, then yes, you can. Don't forget to mention that the information and audio are from Deezer, and that's all :) »

Cette réponse vient d'un membre de la communauté, pas d'un employé de Deezer : elle est cohérente avec les conditions mais ne les engage pas. Par contraste, Spotify interdit expressément les jeux et quiz dans ses conditions développeur ; Deezer ne contient rien de tel.

### 2. Lecture des extraits dans le navigateur : conforme

- **Pas de stockage** : « Local Storage/Offline Storage of audio data is strictly forbidden. » L'élément audio lit l'extrait en flux, rien n'est gardé. Ne jamais mettre l'audio dans IndexedDB, Cache Storage ou le service worker : `ngsw-config.json` n'a aucun `dataGroups`.
- **Pas de téléchargement** : « Except for 30s. extracts mp3s, full-length tracks URLs must never be accessible to the end-user ». Les extraits de 30 s sont exclus de cette règle : une URL d'extrait visible dans l'onglet réseau ne pose pas de problème.
- **Pas de contournement des protections** (art. V, DRM) : les extraits sont des MP3 publics servis avec `Access-Control-Allow-Origin: *`.

### 3. Attribution : conforme

- Le badge officiel « À écouter sur Deezer » et le lien vers la page Deezer de chaque morceau répondent à la demande de mentionner Deezer. Utiliser le badge tel quel, sans le modifier (les conditions intègrent les « Trademark Guidelines », art. II).
- La page `/privacy` a une section « Mentions légales : contenus musicaux » : contenus fournis par Deezer, site non affilié.

### 4. Usage non commercial : conforme, avec une nuance

Art. IV :
> « The Developer agrees that the use of the Services is strictly limited for a non-commercial purpose and in a non-commercial environment. It means that the Developer shall not perceive, receive, generate, benefit or create directly or indirectly, any moneys, incomes, revenues, data or any other consideration in connection with the use of neither the Services themselves, nor any and all Content accessed through the Services. »

- Jeu gratuit, sans publicité ni vente : conforme. La discussion de 2023 montre que la publicité suffit à rendre l'usage commercial.
- La licence PolyForm Noncommercial porte sur le code, pas sur l'usage de Deezer : ce qui compte, c'est que le site ne rapporte rien.
- Le mot « data » : les comptes et les statistiques de jeu sont des données liées au service. Elles ne sont ni vendues ni exploitées ; ne jamais les monétiser.
- Le contenu ne doit pas être « associated, directly or indirectly with any trademark, brand name, or logo » : lu comme visant les marques commerciales (sponsoring, partenaires). Ne jamais associer de marque tierce au jeu.

### 5. Cache des URL d'extrait côté serveur : conforme

On ne met en cache que l'URL (un texte), jamais l'audio, et le cache est borné par l'expiration de la signature (piège 14). La FAQ autorise le stockage des métadonnées :
> « Is it possible to store artist and track names locally without stocking the audio? Yes, it is possible. »

## Écarts relevés le 02/10/2026, tous corrigés

| Écart | Texte | Correctif |
|---|---|---|
| Mention « usage privé, cadre familial » absente | art. IV : « inform […] that the streaming of the recordings is limited to a strictly private use within a family scope » | phrase ajoutée dans « Mentions légales : contenus musicaux » de `/privacy` (FR et EN) |
| Pochettes dans les stories Instagram de l'admin | FAQ : « images are not allowed to be stored for legal reasons » ; art. VII (droits sur les visuels) | pochette retirée des stories, remplacée par une vignette (`weekly-story-visual.component.ts`) ; dans le jeu, la pochette est chargée depuis le CDN Deezer et seul son hash est gardé |
| `/privacy` disait que Deezer ne reçoit rien du joueur | (RGPD) | reformulé : le navigateur charge extraits et pochettes depuis les CDN de Deezer (`cdnt-preview.dzcdn.net`, `cdn-images.dzcdn.net`), qui reçoivent l'IP du joueur |

## Rappels

- Deezer peut couper l'accès à tout moment, sans préavis (art. II c). Il n'existe ni API payante ni certification.
- Quota d'environ 50 requêtes par 5 s : respecté par `catalogue-refresh` (lots de 10 toutes les 1,5 s, piège 16).
