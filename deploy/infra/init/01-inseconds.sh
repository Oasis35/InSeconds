#!/bin/bash
# Exécuté une seule fois, au tout premier démarrage du conteneur (volume vide).
# Crée la base + l'utilisateur dédiés au projet InSeconds dans l'instance Postgres partagée.
set -e

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
    CREATE USER inseconds WITH PASSWORD '$INSECONDS_DB_PASSWORD';
    CREATE DATABASE inseconds OWNER inseconds;
EOSQL
