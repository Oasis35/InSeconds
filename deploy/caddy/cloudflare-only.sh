#!/usr/bin/env bash
# N'accepte les ports 80/443 du VPS que depuis les plages IP de Cloudflare.
#
# Sans ce filtre, quiconque connaît l'IP du VPS peut joindre Caddy directement, sans passer
# par le WAF ni l'anti-DDoS de Cloudflare. SSH et les autres ports ne sont pas touchés.
#
# Pourquoi pas UFW : les ports publiés par Docker ("80:80", "443:443" dans
# deploy/caddy/docker-compose.yml) passent par la chaîne FORWARD et contournent UFW. Le filtre
# vit donc dans DOCKER-USER (chaîne prévue par Docker pour ça), et aussi dans INPUT pour le cas
# où Docker sert un port via docker-proxy (IPv6 sans ip6tables Docker).
#
# Usage (root) :
#   sudo ./cloudflare-only.sh apply      # télécharge les plages Cloudflare et pose le filtre
#   sudo ./cloudflare-only.sh status     # affiche les règles et la taille des listes
#   sudo ./cloudflare-only.sh remove     # retire tout (retour à l'état d'origine)
#   sudo ./cloudflare-only.sh install    # copie le script + service systemd (boot) + timer quotidien
#   sudo ./cloudflare-only.sh uninstall  # retire le service, le timer et le filtre
#
# Interface publique détectée via la route par défaut ; forcer avec EXT_IF=eth0.
# Idempotent : relancer « apply » reconstruit tout, sans doublon.

set -euo pipefail

CHAIN="CF-ONLY"
SET4="cf-ipv4"
SET6="cf-ipv6"
URL4="https://www.cloudflare.com/ips-v4"
URL6="https://www.cloudflare.com/ips-v6"
INSTALL_PATH="/usr/local/sbin/cloudflare-only.sh"
UNIT="cloudflare-only"

log() { echo "[cloudflare-only] $*"; }
die() { echo "[cloudflare-only] ERREUR : $*" >&2; exit 1; }

require_root() { [[ $EUID -eq 0 ]] || die "à lancer en root (sudo)."; }

require_tools() {
  local missing=()
  for tool in iptables ip6tables ipset curl ip; do
    command -v "$tool" >/dev/null 2>&1 || missing+=("$tool")
  done
  ((${#missing[@]} == 0)) || die "outils manquants : ${missing[*]} (apt install ipset curl iptables)"
}

ext_if() {
  local iface="${EXT_IF:-}"
  [[ -n "$iface" ]] || iface=$(ip route show default | awk '{for (i = 1; i < NF; i++) if ($i == "dev") { print $(i + 1); exit }}')
  [[ -n "$iface" ]] || die "interface publique introuvable, préciser EXT_IF=..."
  echo "$iface"
}

# Télécharge une liste de plages et vérifie qu'elle ressemble bien à des CIDR : une liste vide
# ou une page d'erreur ne doit jamais remplacer la liste en place (sinon tout le trafic tombe).
fetch_ranges() {
  local url="$1" pattern="$2" body
  body=$(curl -fsS --max-time 20 "$url") || die "téléchargement impossible : $url"
  body=$(printf '%s\n' "$body" | tr -d '\r' | sed '/^[[:space:]]*$/d')
  (($(printf '%s\n' "$body" | wc -l) >= 5)) || die "liste trop courte depuis $url"
  printf '%s\n' "$body" | grep -Eqv "$pattern" && die "contenu inattendu depuis $url"
  printf '%s\n' "$body"
}

# Remplit un set temporaire puis l'échange avec le set en place : jamais de fenêtre où la
# liste est vide pendant une mise à jour.
load_set() {
  local name="$1" family="$2" ranges="$3" tmp="$1-tmp"
  ipset create "$name" hash:net family "$family" -exist
  ipset destroy "$tmp" 2>/dev/null || true
  ipset create "$tmp" hash:net family "$family"
  while read -r cidr; do ipset add "$tmp" "$cidr"; done <<<"$ranges"
  ipset swap "$tmp" "$name"
  ipset destroy "$tmp"
  log "$name : $(wc -l <<<"$ranges") plages"
}

# Retire toutes les occurrences d'une règle (boucle : une règle posée deux fois part aussi).
delete_rule() {
  local cmd="$1"; shift
  while "$cmd" -w -C "$@" 2>/dev/null; do "$cmd" -w -D "$@"; done
}

jumps() {
  # Émet, pour une famille, les règles de saut vers la chaîne de filtrage (une par ligne).
  local cmd="$1" iface="$2"
  echo "INPUT -i $iface -p tcp -m multiport --dports 80,443 -j $CHAIN"
  if "$cmd" -w -nL DOCKER-USER >/dev/null 2>&1; then
    # --ctorigdstport : port demandé par le client, avant la redirection (DNAT) de Docker.
    echo "DOCKER-USER -i $iface -p tcp -m conntrack --ctorigdstport 80 --ctdir ORIGINAL -j $CHAIN"
    echo "DOCKER-USER -i $iface -p tcp -m conntrack --ctorigdstport 443 --ctdir ORIGINAL -j $CHAIN"
  fi
}

remove_family() {
  local cmd="$1" iface="$2" rule
  while read -r rule; do
    # shellcheck disable=SC2086 # découpage voulu de la règle en arguments
    [[ -n "$rule" ]] && delete_rule "$cmd" $rule
  done < <(jumps "$cmd" "$iface")
  "$cmd" -w -F "$CHAIN" 2>/dev/null || true
  "$cmd" -w -X "$CHAIN" 2>/dev/null || true
}

apply_family() {
  local cmd="$1" set="$2" iface="$3" rule chain
  "$cmd" -w -N "$CHAIN" 2>/dev/null || "$cmd" -w -F "$CHAIN"
  "$cmd" -w -A "$CHAIN" -m set --match-set "$set" src -j RETURN
  "$cmd" -w -A "$CHAIN" -j DROP
  while read -r rule; do
    [[ -n "$rule" ]] || continue
    chain="${rule%% *}"
    # shellcheck disable=SC2086
    delete_rule "$cmd" $rule
    # shellcheck disable=SC2086
    "$cmd" -w -I "$chain" 1 ${rule#* }
  done < <(jumps "$cmd" "$iface")
}

cmd_apply() {
  require_root; require_tools
  local iface ranges4 ranges6
  iface=$(ext_if)
  ranges4=$(fetch_ranges "$URL4" '^[0-9]{1,3}(\.[0-9]{1,3}){3}/[0-9]{1,2}$')
  ranges6=$(fetch_ranges "$URL6" '^[0-9a-fA-F:]+/[0-9]{1,3}$')
  load_set "$SET4" inet "$ranges4"
  load_set "$SET6" inet6 "$ranges6"
  apply_family iptables "$SET4" "$iface"
  apply_family ip6tables "$SET6" "$iface"
  log "filtre actif sur $iface : 80/443 réservés à Cloudflare (SSH inchangé)."
  if ! iptables -w -nL DOCKER-USER >/dev/null 2>&1; then
    log "ATTENTION : chaîne DOCKER-USER absente (Docker pas démarré ?). Relancer après Docker."
  fi
}

cmd_remove() {
  require_root
  local iface
  iface=$(ext_if)
  remove_family iptables "$iface"
  remove_family ip6tables "$iface"
  ipset destroy "$SET4" 2>/dev/null || true
  ipset destroy "$SET6" 2>/dev/null || true
  log "filtre retiré : 80/443 à nouveau ouverts à tous."
}

cmd_status() {
  local cmd
  for cmd in iptables ip6tables; do
    echo "== $cmd"
    "$cmd" -w -S "$CHAIN" 2>/dev/null || echo "(chaîne $CHAIN absente)"
    "$cmd" -w -S INPUT | grep -- "-j $CHAIN" || true
    "$cmd" -w -S DOCKER-USER 2>/dev/null | grep -- "-j $CHAIN" || true
  done
  for set in "$SET4" "$SET6"; do
    echo "== $set : $(ipset list "$set" 2>/dev/null | grep -c '/' || true) plages"
  done
}

cmd_install() {
  require_root; require_tools
  install -m 0755 "$(readlink -f "$0")" "$INSTALL_PATH"
  cat >"/etc/systemd/system/$UNIT.service" <<EOF
[Unit]
Description=Ports 80/443 réservés aux plages IP Cloudflare
Wants=network-online.target
After=network-online.target docker.service ufw.service

[Service]
Type=oneshot
ExecStart=$INSTALL_PATH apply

[Install]
WantedBy=multi-user.target
EOF
  # Rejoué chaque jour : met à jour les plages Cloudflare et repose le filtre si un
  # redémarrage de Docker ou un « ufw reload » l'a fait sauter entre-temps.
  cat >"/etc/systemd/system/$UNIT.timer" <<EOF
[Unit]
Description=Mise à jour quotidienne du filtre Cloudflare

[Timer]
OnCalendar=daily
RandomizedDelaySec=1h
Persistent=true

[Install]
WantedBy=timers.target
EOF
  systemctl daemon-reload
  systemctl enable --now "$UNIT.service" "$UNIT.timer"
  log "installé : $UNIT.service (au boot) + $UNIT.timer (quotidien)."
}

cmd_uninstall() {
  require_root
  systemctl disable --now "$UNIT.timer" "$UNIT.service" 2>/dev/null || true
  rm -f "/etc/systemd/system/$UNIT.service" "/etc/systemd/system/$UNIT.timer"
  systemctl daemon-reload
  cmd_remove
  rm -f "$INSTALL_PATH"
  log "désinstallé."
}

case "${1:-}" in
  apply) cmd_apply ;;
  remove) cmd_remove ;;
  status) cmd_status ;;
  install) cmd_install ;;
  uninstall) cmd_uninstall ;;
  *) sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 1 ;;
esac
