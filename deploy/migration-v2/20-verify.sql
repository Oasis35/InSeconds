-- Vérifications de l'import (§ 8.5 du plan v2), dans la même transaction que 10-import.sql : au
-- moindre écart, une exception annule tout. Rien de personnel dans les messages (S13).

-- Un contrôle = deux nombres qui doivent être égaux (le plus souvent : attendu, et trouvé en v2).
CREATE FUNCTION pg_temp.expect(label text, expected bigint, actual bigint) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF expected IS DISTINCT FROM actual THEN
        RAISE EXCEPTION 'Vérification « % » : % attendu(s), % trouvé(s)', label, expected, actual;
    END IF;
END $$;

-- ============================================================================================
-- Players (PR B4)
-- ============================================================================================

-- Nombre de lignes
SELECT pg_temp.expect('joueurs',
    (SELECT count(*) FROM public."Players"), (SELECT count(*) FROM players.players));
SELECT pg_temp.expect('comptes (joueurs non invités)',
    (SELECT count(*) FROM public."Players" WHERE NOT "IsGuest"), (SELECT count(*) FROM players.accounts));
SELECT pg_temp.expect('jetons v1 (un par joueur)',
    (SELECT count(*) FROM public."Players"), (SELECT count(*) FROM players.legacy_tokens));
SELECT pg_temp.expect('clés Data Protection',
    (SELECT count(*) FROM public."DataProtectionKeys"), (SELECT count(*) FROM infra.data_protection_keys));
SELECT pg_temp.expect('jetons de connexion encore valables',
    (SELECT count(*) FROM public."MagicLinkTokens" WHERE "ConsumedAt" IS NULL AND "ExpiresAt" > now()),
    (SELECT count(*) FROM players.auth_tokens WHERE purpose = 1));
SELECT pg_temp.expect('jetons de changement d''email encore valables',
    (SELECT count(*) FROM public."EmailChangeTokens" WHERE "ConsumedAt" IS NULL AND "ExpiresAt" > now()),
    (SELECT count(*) FROM players.auth_tokens WHERE purpose = 2));

-- Jetons envoyés par email : même hash (hexadécimal v1 décodé), même adresse, mêmes dates.
SELECT pg_temp.expect('jetons de connexion repris à l''identique', 0, (
    SELECT count(*) FROM public."MagicLinkTokens" m
    LEFT JOIN players.auth_tokens t ON t.purpose = 1 AND t.token_hash = decode(m."TokenHash", 'hex')
    WHERE m."ConsumedAt" IS NULL AND m."ExpiresAt" > now()
      AND (t.id IS NULL
           OR t.email::text IS DISTINCT FROM m."Email"
           OR t.expires_at IS DISTINCT FROM m."ExpiresAt"
           OR t.created_at IS DISTINCT FROM m."CreatedAt")));
SELECT pg_temp.expect('jetons de changement d''email repris à l''identique', 0, (
    SELECT count(*) FROM public."EmailChangeTokens" e
    LEFT JOIN players.auth_tokens t ON t.purpose = 2 AND t.token_hash = decode(e."TokenHash", 'hex')
    WHERE e."ConsumedAt" IS NULL AND e."ExpiresAt" > now()
      AND (t.id IS NULL
           OR t.player_id IS DISTINCT FROM e."PlayerId"
           OR t.new_email::text IS DISTINCT FROM e."NewEmail"
           OR t.expires_at IS DISTINCT FROM e."ExpiresAt"
           OR t.created_at IS DISTINCT FROM e."CreatedAt")));

-- Joueurs : dates et suppression identiques (supprimé sans date : dernière visite ou création).
SELECT pg_temp.expect('joueurs repris à l''identique', 0, (
    SELECT count(*) FROM public."Players" p
    LEFT JOIN players.players v ON v.id = p."Id"
    WHERE v.id IS NULL
       OR v.created_at IS DISTINCT FROM p."CreatedAt"
       OR v.last_seen_at IS DISTINCT FROM p."LastSeenAt"
       OR v.deleted_at IS DISTINCT FROM
          CASE WHEN p."IsDeleted" THEN COALESCE(p."DeletedAt", p."LastSeenAt", p."CreatedAt") END));

-- Comptes : chaque email et chaque pseudo retrouvés à l'identique (casse comprise), rôle admin identique.
SELECT pg_temp.expect('comptes repris à l''identique', 0, (
    SELECT count(*) FROM public."Players" p
    LEFT JOIN players.accounts a ON a.player_id = p."Id"
    WHERE NOT p."IsGuest"
      AND (a.player_id IS NULL
           OR a.email::text IS DISTINCT FROM p."Email"
           OR a.pseudo::text IS DISTINCT FROM p."Pseudo"
           OR a.is_admin IS DISTINCT FROM p."IsAdmin")));
SELECT pg_temp.expect('aucun compte pour un invité', 0, (
    SELECT count(*) FROM public."Players" p
    JOIN players.accounts a ON a.player_id = p."Id"
    WHERE p."IsGuest"));

-- Jetons v1 : pour chaque joueur, sha256(AuthToken) présent, et rattaché à ce joueur.
SELECT pg_temp.expect('jetons v1 retrouvés', 0, (
    SELECT count(*) FROM public."Players" p
    LEFT JOIN players.legacy_tokens t
           ON t.player_id = p."Id" AND t.token_hash = sha256(convert_to(p."AuthToken"::text, 'UTF8'))
    WHERE t.player_id IS NULL));

-- Clés Data Protection copiées telles quelles.
SELECT pg_temp.expect('clés Data Protection identiques', 0, (
    SELECT count(*) FROM public."DataProtectionKeys" k
    LEFT JOIN infra.data_protection_keys v
           ON v.id = k."Id" AND v.friendly_name IS NOT DISTINCT FROM k."FriendlyName" AND v.xml IS NOT DISTINCT FROM k."Xml"
    WHERE v.id IS NULL));

-- ============================================================================================
-- Catalogue (PR C2)
-- ============================================================================================

-- Nombre de lignes
SELECT pg_temp.expect('morceaux',
    (SELECT count(*) FROM public."Tracks"), (SELECT count(*) FROM catalogue.tracks));
SELECT pg_temp.expect('identifiants Deezer distincts',
    (SELECT count(DISTINCT "DeezerTrackId") FROM public."Tracks"),
    (SELECT count(DISTINCT deezer_track_id) FROM catalogue.tracks));

-- Morceaux : identifiant, noms, pochette, année et dates repris à l'identique.
SELECT pg_temp.expect('morceaux repris à l''identique', 0, (
    SELECT count(*) FROM public."Tracks" t
    LEFT JOIN catalogue.tracks v ON v.id = t."Id"
    WHERE v.id IS NULL
       OR v.deezer_track_id IS DISTINCT FROM t."DeezerTrackId"
       OR v.artist IS DISTINCT FROM t."Artist"
       OR v.title IS DISTINCT FROM t."Title"
       OR v.cover_hash IS DISTINCT FROM t."CoverHash"
       OR v.release_year::int IS DISTINCT FROM t."ReleaseYear"
       OR v.created_at IS DISTINCT FROM t."CreatedAt"
       OR v.updated_at IS DISTINCT FROM t."UpdatedAt"));

-- Extrait : HasPreview devient disponible (1) ou absent (2), jamais inconnu ; rang et contrôle inconnus.
SELECT pg_temp.expect('état de l''extrait', 0, (
    SELECT count(*) FROM public."Tracks" t
    JOIN catalogue.tracks v ON v.id = t."Id"
    WHERE v.preview_status IS DISTINCT FROM CASE WHEN t."HasPreview" THEN 1 ELSE 2 END
       OR v.preview_checked_at IS NOT NULL
       OR v.deezer_rank IS NOT NULL
       OR v.rank_updated_at IS NOT NULL));

-- Désactivation : même ensemble de morceaux désactivés, avec la dernière modification pour date quand elle existe.
SELECT pg_temp.expect('morceaux désactivés', 0, (
    SELECT count(*) FROM public."Tracks" t
    JOIN catalogue.tracks v ON v.id = t."Id"
    WHERE (v.disabled_at IS NOT NULL) IS DISTINCT FROM t."IsDisabled"
       OR (t."IsDisabled" AND t."UpdatedAt" IS NOT NULL AND v.disabled_at IS DISTINCT FROM t."UpdatedAt")));

-- Séquence : le prochain lot d'identifiants commence au-delà du plus grand identifiant repris.
SELECT pg_temp.expect('séquence des identifiants de morceaux', 1, (
    SELECT CASE WHEN (SELECT CASE WHEN is_called THEN last_value + 10 ELSE last_value END FROM catalogue.tracks_hilo)
                    > COALESCE((SELECT max(id) FROM catalogue.tracks), 0) THEN 1 ELSE 0 END));
