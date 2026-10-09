-- Contrôle de la forme de la source (§ 8.5 du plan v2, PR G1), avant tout import : les tables v1 de public
-- doivent être exactement celles que l'import connaît, colonne par colonne (type et nullabilité). Une migration
-- v1 arrivée pendant le chantier (colonne ou table en plus, type changé) arrête l'import avec la liste des
-- écarts : une colonne inconnue serait perdue sans bruit, une colonne disparue ou retypée ferait échouer
-- l'import plus loin sans dire pourquoi.
--
-- La liste ci-dessous est la forme de la v1 au moment de G1 (schéma généré par `dotnet ef migrations script`).
-- MigrationTests la compare au schéma généré depuis le code v1 : une migration v1 ajoutée sans mettre à jour
-- cette liste (et l'import) fait échouer les tests. Les colonnes abandonnées (§ 8.3 : DeezerRankSnapshot,
-- LastUsedDate, UsageCount, IsGuest, les Id des morceaux du défi et des réponses…) y sont aussi : connues,
-- pas reprises.

CREATE TEMP TABLE import_expected_source (
    table_name  text NOT NULL,
    column_name text NOT NULL,
    data_type   text NOT NULL,
    nullable    boolean NOT NULL,
    PRIMARY KEY (table_name, column_name)
) ON COMMIT DROP;

-- Une ligne par table : « Colonne:type », un « ? » après le type si la colonne accepte NULL. Les types sont
-- ceux d'information_schema, abrégés pour les plus longs (varchar, ts, int, bool).
INSERT INTO import_expected_source (table_name, column_name, data_type, nullable)
SELECT t.table_name, split_part(c.spec, ':', 1), COALESCE(ty.data_type, rtrim(split_part(c.spec, ':', 2), '?')),
       c.spec LIKE '%?'
FROM (VALUES
    ('__EFMigrationsHistory', 'MigrationId:varchar ProductVersion:varchar'),
    ('Players', 'Id:uuid IsGuest:bool Pseudo:varchar? Email:varchar? AuthToken:uuid CreatedAt:ts LastSeenAt:ts?' ||
                 ' IsDeleted:bool DeletedAt:ts? CurrentStreak:int LastPlayedDate:date? IsAdmin:bool StreakFreezes:int'),
    ('MagicLinkTokens', 'Id:int Email:varchar TokenHash:varchar ExpiresAt:ts ConsumedAt:ts? CreatedAt:ts'),
    ('EmailChangeTokens', 'Id:int PlayerId:uuid NewEmail:varchar TokenHash:varchar ExpiresAt:ts ConsumedAt:ts?' ||
                           ' CreatedAt:ts'),
    ('DataProtectionKeys', 'Id:int FriendlyName:text? Xml:text?'),
    ('Settings', 'Id:int Key:varchar Value:varchar Description:varchar? UpdatedAt:ts'),
    ('Tracks', 'Id:int DeezerTrackId:bigint Artist:varchar Title:varchar CreatedAt:ts UpdatedAt:ts? CoverHash:varchar?' ||
                ' HasPreview:bool LastUsedDate:date? UsageCount:int ReleaseYear:int? IsDisabled:bool'),
    ('DailyChallenges', 'Id:int Date:date Seed:int'),
    ('DailyChallengeTracks', 'Id:int DailyChallengeId:int TrackId:int DeezerRankSnapshot:int Position:int'),
    ('GameSessions', 'Id:int PlayerId:uuid DailyChallengeId:int TotalScore:int TotalDurationSeconds:numeric' ||
                      ' CreatedAt:ts AbandonedAt:ts? CompletedAt:ts? Status:int CurrentTrackId:int?' ||
                      ' CurrentTrackMinListenedSeconds:numeric? CurrentTrackHintLevelUsed:int FreezeEarned:bool' ||
                      ' FreezesUsed:int'),
    ('GameSessionAnswers', 'Id:int GameSessionId:int DailyChallengeTrackId:int ListenedDurationSeconds:numeric' ||
                            ' WasExtended:bool ArtistAnswer:varchar? TitleAnswer:varchar? ArtistCorrect:bool' ||
                            ' TitleCorrect:bool Score:int HintLevelUsed:int')
) AS t(table_name, columns)
CROSS JOIN LATERAL regexp_split_to_table(trim(t.columns), '\s+') AS c(spec)
LEFT JOIN (VALUES
    ('varchar', 'character varying'),
    ('ts', 'timestamp with time zone'),
    ('int', 'integer'),
    ('bool', 'boolean')
) AS ty(short, data_type) ON ty.short = rtrim(split_part(c.spec, ':', 2), '?');

DO $$
DECLARE
    gaps text;
BEGIN
    WITH actual AS (
        SELECT c.table_name::text AS table_name, c.column_name::text AS column_name, c.data_type::text AS data_type,
               c.is_nullable = 'YES' AS nullable
        FROM information_schema.columns c
        JOIN information_schema.tables t ON t.table_schema = c.table_schema AND t.table_name = c.table_name
        WHERE c.table_schema = 'public' AND t.table_type = 'BASE TABLE'),
    gap AS (
        -- Colonne attendue absente, ou d'un autre type, ou dont la nullabilité a changé.
        SELECT format('%s.%s : %s', e.table_name, e.column_name,
                      CASE WHEN a.column_name IS NULL THEN 'absente'
                           ELSE format('%s%s au lieu de %s%s',
                                       a.data_type, CASE WHEN a.nullable THEN ' NULL' ELSE '' END,
                                       e.data_type, CASE WHEN e.nullable THEN ' NULL' ELSE '' END) END) AS line
        FROM import_expected_source e
        LEFT JOIN actual a ON a.table_name = e.table_name AND a.column_name = e.column_name
        WHERE a.column_name IS NULL OR a.data_type <> e.data_type OR a.nullable <> e.nullable
        UNION ALL
        -- Colonne ou table inconnue de l'import : ses données ne seraient pas reprises.
        SELECT format('%s.%s : inconnue de l''import', a.table_name, a.column_name)
        FROM actual a
        LEFT JOIN import_expected_source e ON e.table_name = a.table_name AND e.column_name = a.column_name
        WHERE e.column_name IS NULL)
    SELECT string_agg(line, E'\n' ORDER BY line) INTO gaps FROM gap;

    IF gaps IS NOT NULL THEN
        RAISE EXCEPTION E'La forme des tables v1 (schéma public) n''est pas celle que l''import connaît (migration v1 arrivée pendant le chantier ?). Écarts :\n%', gaps
            USING HINT = 'Adapter 05-check-source.sql, 10-import.sql et 20-verify.sql à la nouvelle forme, puis relancer.';
    END IF;
END $$;
