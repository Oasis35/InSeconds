-- Vérification des statistiques figées de l'historique (§ 8.4 du plan v2, PR G1), après l'import et
-- `dotnet InSeconds.Api.dll --freeze-day-stats` :
--   psql --no-psqlrc -v ON_ERROR_STOP=1 -f deploy/migration-v2/30-verify-day-stats.sql
-- Pas dans run-import.sh : la commande de l'API passe entre les deux. Lecture seule, rejouable.
--
-- Chaque jour terminé pour de bon (J-2 et avant, jour UTC, la règle de la tâche daily-close-day) a sa photo, et
-- ses compteurs sont ceux de la v1 (schéma public, encore là jusqu'à l'étape 12) : parties terminées, abandonnées,
-- expirées (une partie restée « en cours » sur un jour passé l'est), aucune en cours, score le plus bas et le plus
-- haut, joueurs supprimés exclus (R8). Les paliers figés sont ceux des réglages importés. Une exception au moindre
-- écart ; rien de personnel dans les messages (S13).

CREATE FUNCTION pg_temp.expect(label text, expected bigint, actual bigint) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
    IF expected IS DISTINCT FROM actual THEN
        RAISE EXCEPTION 'Vérification « % » : % attendu(s), % trouvé(s)', label, expected, actual;
    END IF;
END $$;

-- Les jours à figer : tous ceux d'avant la veille.
CREATE TEMP VIEW closable_days AS
SELECT c.id, c.date FROM daily.challenges c
WHERE c.date <= (now() AT TIME ZONE 'UTC')::date - 2;

SELECT pg_temp.expect('jours terminés avec leur photo',
    (SELECT count(*) FROM closable_days),
    (SELECT count(*) FROM closable_days d JOIN daily.challenge_day_stats s ON s.challenge_id = d.id AND s.version = 1));

-- La liste des jours sans photo, pour savoir quoi relancer (des dates, rien de personnel).
DO $$
DECLARE
    days text;
BEGIN
    SELECT string_agg(d.date::text, ', ' ORDER BY d.date) INTO days
    FROM closable_days d LEFT JOIN daily.challenge_day_stats s ON s.challenge_id = d.id
    WHERE s.challenge_id IS NULL;
    IF days IS NOT NULL THEN
        RAISE EXCEPTION 'Jours terminés sans statistiques figées (relancer --freeze-day-stats) : %', days;
    END IF;
END $$;

-- Les compteurs de chaque photo, recomptés sur les tables de la v1.
SELECT pg_temp.expect('photos conformes à la v1', 0, (
    WITH v1 AS (
        SELECT g."DailyChallengeId" AS challenge_id,
               count(*) FILTER (WHERE g."Status" = 1) AS completed,
               count(*) FILTER (WHERE g."Status" = 2) AS abandoned,
               count(*) FILTER (WHERE g."Status" IN (0, 3)) AS expired,
               min(g."TotalScore") FILTER (WHERE g."Status" = 1) AS score_min,
               max(g."TotalScore") FILTER (WHERE g."Status" = 1) AS score_max
        FROM public."GameSessions" g
        JOIN public."Players" p ON p."Id" = g."PlayerId" AND NOT p."IsDeleted"
        GROUP BY g."DailyChallengeId")
    SELECT count(*) FROM closable_days d
    JOIN daily.challenge_day_stats s ON s.challenge_id = d.id
    LEFT JOIN v1 ON v1.challenge_id = d.id
    WHERE (s.payload ->> 'date')::date IS DISTINCT FROM d.date
       OR (s.payload ->> 'playerCount')::bigint IS DISTINCT FROM COALESCE(v1.completed, 0)
       OR (s.payload ->> 'abandonedCount')::bigint IS DISTINCT FROM COALESCE(v1.abandoned, 0)
       OR (s.payload ->> 'expiredCount')::bigint IS DISTINCT FROM COALESCE(v1.expired, 0)
       OR (s.payload ->> 'pendingCount')::bigint IS DISTINCT FROM 0
       OR (s.payload ->> 'scoreMin')::int IS DISTINCT FROM v1.score_min
       OR (s.payload ->> 'scoreMax')::int IS DISTINCT FROM v1.score_max));

-- Les paliers figés sont ceux des réglages importés (Daily:AllowedDurationsSeconds), triés comme l'API les lit. Sans
-- réglage en base, la photo garde les paliers par défaut de la v2, qui sont ceux de la v1 : rien à comparer.
SELECT pg_temp.expect('photos figées avec les paliers des réglages importés', 0, (
    SELECT count(*) FROM closable_days d
    JOIN daily.challenge_day_stats s ON s.challenge_id = d.id
    CROSS JOIN infra.settings r
    WHERE r.key = 'Daily:AllowedDurationsSeconds'
      AND ARRAY(SELECT e::numeric FROM jsonb_array_elements_text(s.payload -> 'allowedDurationsSeconds') e ORDER BY 1)
          <> ARRAY(SELECT DISTINCT e::numeric FROM jsonb_array_elements_text(r.value) e ORDER BY 1)));

DO $$
DECLARE
    n bigint;
BEGIN
    SELECT count(*) INTO n FROM closable_days;
    RAISE NOTICE 'Statistiques figées vérifiées : % jour(s).', n;
END $$;
