# Caddy — reverse proxy partagé du VPS

Stack **indépendante**, sur le même principe que `deploy/infra/` (Postgres partagé) : un seul
Caddy pour tout le VPS, HTTPS automatique (Let's Encrypt), routage par nom de domaine vers les
conteneurs des différents projets. Se déploie une fois, tourne en permanence.

## Déploiement

```bash
cd ~/caddy   # ou l'emplacement choisi sur le VPS
cp .env.example .env
# éditer .env si besoin (domaines de test vs domaines définitifs)
docker compose up -d
```

Le réseau Docker `caddy-net` est créé par ce stack (`name: caddy-net`, pas `external`). Les
stacks applicatifs (ex. `docker-compose.prod.yml` d'InSeconds) le déclarent en
`external: true` pour le rejoindre — Caddy route alors vers eux par nom de conteneur
(`inseconds.front`, `inseconds.api`), sans qu'aucun port applicatif ne soit publié sur l'hôte.

Ports 80/443 : seuls ports publiés sur l'hôte pour **tout le VPS** — Caddy est le point d'entrée
public unique, tous les autres services restent internes au réseau Docker.

## Ajouter un futur projet

Ajouter un bloc au `Caddyfile` (un domaine → un conteneur), recharger sans downtime :

```
mon-autre-projet.example.com {
	reverse_proxy mon-autre-projet.front:8080
}
```

```bash
docker compose exec caddy caddy reload --config /etc/caddy/Caddyfile
```

Le nouveau projet doit rejoindre `caddy-net` en réseau externe dans son propre
`docker-compose.prod.yml`, comme InSeconds.

## Bascule DNS (terminée le 2026-09-11)

`FRONT_DOMAIN`/`API_DOMAIN` ont d'abord pointé vers des sous-domaines de test
(`vps.inseconds.cc` / `vps-api.inseconds.cc`) pour valider tout le mécanisme (HTTPS, routage)
sans toucher au DNS de production. Un point clé
découvert à cette occasion : le challenge **DNS-01 fonctionne indépendamment de la cible DNS
actuelle du domaine** (il ne fait que créer un enregistrement TXT via l'API Cloudflare) — les
certificats pour les **vrais** domaines (`inseconds.cc`, `www.inseconds.cc`, `api.inseconds.cc`)
ont donc pu être obtenus **avant** la bascule DNS elle-même, réduisant le downtime à quasi zéro
au moment du switch. `.env` porte maintenant les domaines définitifs (`FRONT_DOMAIN=inseconds.cc,
www.inseconds.cc`, `API_DOMAIN=api.inseconds.cc`) — le front Angular avait déjà son `apiUrl` de
prod figé sur `https://api.inseconds.cc` au build, donc **aucun rebuild n'a été nécessaire**,
seul le DNS a changé de cible.

## Challenge DNS Cloudflare (IP du VPS jamais exposée)

Image Caddy custom (`Dockerfile`, build via `xcaddy` + module `caddy-dns/cloudflare`) : le
certificat Let's Encrypt est validé par un enregistrement TXT temporaire créé via l'API
Cloudflare, pas par une requête HTTP entrante sur le VPS. Ça permet de garder le proxy
Cloudflare **actif** (nuage orange) sur tous les domaines — les enregistrements DNS pointent
bien vers l'IP du VPS en interne (champ "Content" visible seulement par le propriétaire du
compte Cloudflare), mais seule l'IP Cloudflare est visible publiquement (`dig`/`nslookup` depuis
l'extérieur ne révèle jamais l'IP réelle du VPS).

Nécessite `CF_API_TOKEN` (cf. `.env.example`) — token scopé en écriture DNS sur la zone
`inseconds.cc` uniquement, jamais le token de compte Cloudflare global.

Conteneur Caddy tourne en **utilisateur non-root** (`uid 1000`, capacité Linux
`CAP_NET_BIND_SERVICE` posée sur le binaire via `setcap` pour bind les ports 80/443 sans être
root) — corrige un finding SonarCloud "Security Rating on New Code" (B → A) détecté à l'ouverture
de la première PR de ce stack. Nécessite de recréer les volumes `caddy_data`/`caddy_config` si
appliqué après coup sur un déploiement déjà en place (permissions root existantes sur les
certificats déjà stockés) — sans impact ici car domaines de test, certificats réémis en
quelques secondes.

## Ports 80/443 réservés à Cloudflare (`cloudflare-only.sh`, optionnel)

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
