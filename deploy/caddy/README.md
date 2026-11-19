# Caddy - reverse proxy partagé du VPS

Stack **indépendante**, sur le même principe que `deploy/infra/` (Postgres partagé) : un seul
Caddy pour tout le VPS, HTTPS automatique (Let's Encrypt), routage par nom de domaine vers les
conteneurs des différents projets. Se déploie une fois, tourne en permanence, depuis le checkout
de prod : `~/apps/InSeconds/deploy/caddy` (son `.env` y vit, non commité).

## Déploiement

```bash
cd ~/apps/InSeconds/deploy/caddy
cp .env.example .env
# éditer .env : CF_API_TOKEN (cf. plus bas), domaines si besoin
docker compose up -d
```

Le réseau Docker `caddy-net` est créé par ce stack (`name: caddy-net`, pas `external`). Les
stacks applicatifs (ex. `docker-compose.prod.yml` d'InSeconds) le déclarent en
`external: true` pour le rejoindre - Caddy route alors vers eux par nom de conteneur
(`inseconds.front`, `inseconds.api`), sans qu'aucun port applicatif ne soit publié sur l'hôte.

Ports 80/443 : seuls ports publiés sur l'hôte pour **tout le VPS** - Caddy est le point d'entrée
public unique, tous les autres services restent internes au réseau Docker.

Domaines servis par le `Caddyfile` : la prod (`{$FRONT_DOMAIN}` → `inseconds.front`,
`{$API_DOMAIN}` → `inseconds.api`, valeurs dans `.env`) et le staging, écrit en dur
(`dev.inseconds.cc` → `inseconds-staging.front`, `api-dev.inseconds.cc` → `inseconds-staging.api`,
cf. `docs/exploitation/deploiement.md` § Staging). Jamais déployé par la CI : après un
`git pull` / `git reset --hard` qui modifie le `Caddyfile`, faire `docker restart caddy`, un
`caddy reload` relirait l'ancien fichier (piège 26 du `CLAUDE.md` racine).

Seule route qui ne suit pas le domaine : `/sitemap.xml` du domaine du front (et de
`dev.inseconds.cc`) part vers l'API (`inseconds.api`, `inseconds-staging.api`), qui liste les jours
dont les réponses sont publiées ; le `sitemap.xml` statique du front ne sert que si cette route
manque. Une modification de cette route se recharge comme toute modification du `Caddyfile`
(`docker restart caddy` après un `git pull`, piège 26).

## Ajouter un futur projet

Ajouter un bloc au `Caddyfile` (un domaine → un conteneur), recharger sans downtime (fichier
édité sur place ; après un `git pull`, `docker restart caddy`, cf. ci-dessus) :

```
mon-autre-projet.example.com {
	reverse_proxy mon-autre-projet.front:8080
}
```

```bash
cd ~/apps/InSeconds/deploy/caddy
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

Le nouveau projet doit rejoindre `caddy-net` en réseau externe dans son propre
`docker-compose.prod.yml`, comme InSeconds.

## Domaines

`.env` porte les domaines de la prod, les mêmes que `.env.example` : `FRONT_DOMAIN=inseconds.cc, www.inseconds.cc`
(une liste séparée par des virgules, que Caddy lit comme plusieurs adresses du même site ; les deux
sont des origines autorisées de l'API, `appsettings.Production.json`) et `API_DOMAIN=api.inseconds.cc`.
Le front a l'adresse de l'API figée au build (`https://api.inseconds.cc`). Les domaines du staging
sont écrits en dur dans le `Caddyfile`. Le challenge **DNS-01 ne dépend pas de la cible DNS actuelle du
domaine** (il crée seulement un enregistrement TXT via l'API Cloudflare) : le certificat d'un
nouveau domaine s'obtient avant même de le faire pointer vers le VPS.

## Challenge DNS Cloudflare (IP du VPS jamais exposée)

Image Caddy custom (`Dockerfile`, build via `xcaddy` + module `caddy-dns/cloudflare`) : le
certificat Let's Encrypt est validé par un enregistrement TXT temporaire créé via l'API
Cloudflare, pas par une requête HTTP entrante sur le VPS. Ça permet de garder le proxy
Cloudflare **actif** (nuage orange) sur tous les domaines - les enregistrements DNS pointent
bien vers l'IP du VPS en interne (champ "Content" visible seulement par le propriétaire du
compte Cloudflare), mais seule l'IP Cloudflare est visible publiquement (`dig`/`nslookup` depuis
l'extérieur ne révèle jamais l'IP réelle du VPS).

Nécessite `CF_API_TOKEN` (cf. `.env.example`) - token scopé en écriture DNS sur la zone
`inseconds.cc` uniquement, jamais le token de compte Cloudflare global.

Le conteneur Caddy tourne en **utilisateur non-root** (`uid 1000`, capacité Linux
`CAP_NET_BIND_SERVICE` posée sur le binaire par `setcap` pour ouvrir les ports 80/443 sans être
root). Les volumes `caddy_data`/`caddy_config` doivent lui appartenir : des certificats écrits
par un Caddy lancé en root ne seraient pas relisibles (recréer alors les volumes, les certificats
sont réémis en quelques secondes).

## IP réelle du visiteur (`trusted_proxies cloudflare`)

Sans `trusted_proxies` déclaré, Caddy (≥ 2.5) ne fait confiance à personne pour
`X-Forwarded-For` et le remplace par l'IP de qui lui parle directement - le serveur Cloudflare
(edge), jamais le vrai visiteur. Le back (rate limiting par IP - magic link, création de joueur,
autocomplete Deezer…) recevait donc la même IP pour tous les visiteurs d'un même edge Cloudflare
(cf. CLAUDE.md racine, pièges 27 et 34).

Le `Caddyfile` déclare en tête un bloc d'options globales avec le module
`github.com/WeidiDeng/caddy-cloudflare-ip` (ajouté au build `xcaddy` du `Dockerfile`) :
télécharge et rafraîchit périodiquement les plages IP publiées par Cloudflare, pour que Caddy
les reconnaisse comme proxy de confiance et déroule `X-Forwarded-For` jusqu'à l'IP réelle du
visiteur.

```bash
cd ~/apps/InSeconds/deploy/caddy
docker compose build --no-cache caddy
docker compose up -d
```

Vérifier après coup que l'API voit bien la vraie IP (pas celle de Cloudflare) - ex. en
observant `docker logs inseconds.api` sur une requête de test, ou toute route qui logue l'IP
source.

## Ports 80/443 réservés à Cloudflare (`cloudflare-only.sh`)

UFW ouvre 80/443 au monde entier : quelqu'un qui connaît l'IP du VPS peut joindre Caddy en
direct, sans le WAF ni l'anti-DDoS de Cloudflare. `cloudflare-only.sh` n'accepte ces deux ports
que depuis les plages publiées par Cloudflare (https://www.cloudflare.com/ips-v4 et `ips-v6`).
SSH et les autres ports ne sont pas touchés, et le certificat reste renouvelable (challenge
DNS-01, aucune connexion entrante de Let's Encrypt).

Le filtre ne passe pas par UFW : les ports publiés par Docker contournent UFW (chaîne
`FORWARD`). Il est posé dans `DOCKER-USER`, la chaîne prévue par Docker pour ça, et dans
`INPUT` (ports servis par `docker-proxy`, IPv6). Les plages sont dans deux `ipset`
(`cf-ipv4`, `cf-ipv6`), remplacées d'un bloc à chaque mise à jour ; une liste vide ou
invalide est refusée, l'ancienne reste en place.

```bash
cd ~/apps/InSeconds/deploy/caddy
sudo apt install ipset            # si absent
sudo ./cloudflare-only.sh apply   # pose le filtre (non persistant)
sudo ./cloudflare-only.sh status  # règles + nombre de plages chargées
```

Vérifier, **en gardant la session SSH ouverte** :

```bash
curl -I https://inseconds.cc                              # depuis n'importe où : 200, via Cloudflare
curl -m 5 -k -I https://<IP-du-VPS> -H 'Host: inseconds.cc'  # depuis un PC hors Cloudflare : timeout
```

Si tout va bien, le rendre permanent : `sudo ./cloudflare-only.sh install` copie le script dans
`/usr/local/sbin`, le rejoue au démarrage (`cloudflare-only.service`, après Docker et UFW) et
chaque jour (`cloudflare-only.timer`) : mise à jour des plages Cloudflare, et remise en place
du filtre si un redémarrage de Docker ou un `ufw reload` l'a fait sauter entre-temps.

Retour arrière : `sudo ./cloudflare-only.sh remove` (filtre seul) ou `uninstall` (filtre +
service + timer). Interface publique détectée via la route par défaut, forçable avec
`EXT_IF=eth0`.
