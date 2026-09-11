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

## Note de test (avant bascule DNS)

`FRONT_DOMAIN`/`API_DOMAIN` pointent temporairement vers des sous-domaines de test
(`vps.inseconds.cc` / `vps-api.inseconds.cc`) plutôt que les domaines réels, pour valider tout
le mécanisme (HTTPS, routage) sans toucher au DNS de production tant que Northflank sert encore
`inseconds.cc`. Le front Angular ayant son `apiUrl` de prod figé au build sur
`https://api.inseconds.cc`, tester via ces sous-domaines ne valide pas le parcours applicatif
complet (front → API), seulement que Caddy route et sert chaque service correctement en HTTPS.
Le parcours complet se valide naturellement à la bascule DNS réelle (étape 6).

## Challenge DNS Cloudflare (IP du VPS jamais exposée)

Image Caddy custom (`Dockerfile`, build via `xcaddy` + module `caddy-dns/cloudflare`) : le
certificat Let's Encrypt est validé par un enregistrement TXT temporaire créé via l'API
Cloudflare, pas par une requête HTTP entrante sur le VPS. Ça permet de garder le proxy
Cloudflare **actif** (nuage orange) sur `vps.inseconds.cc`/`vps-api.inseconds.cc` — les
enregistrements DNS pointent bien vers l'IP du VPS en interne, mais seule l'IP Cloudflare est
visible publiquement (`dig` depuis l'extérieur ne révèle jamais l'IP réelle).

Nécessite `CF_API_TOKEN` (cf. `.env.example`) — token scopé en écriture DNS sur la zone
`inseconds.cc` uniquement, jamais le token de compte Cloudflare global.

Recommandé côté Cloudflare : mode SSL/TLS **"Full (strict)"** sur la zone (Caddy expose un
certificat Let's Encrypt valide en origine, donc compatible — à vérifier que ça ne casse pas
la config Northflank existante avant de changer ce réglage, qui est au niveau de la zone
entière et pas par sous-domaine).
