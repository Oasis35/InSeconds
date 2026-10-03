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
