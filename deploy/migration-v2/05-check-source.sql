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

INSERT INTO import_expected_source (table_name, column_name, data_type, nullable) VALUES
    ('__EFMigrationsHistory', 'MigrationId', 'character varying', false),
    ('__EFMigrationsHistory', 'ProductVersion', 'character varying', false),

    ('Players', 'Id', 'uuid', false),
    ('Players', 'IsGuest', 'boolean', false),
    ('Players', 'Pseudo', 'character varying', true),
    ('Players', 'Email', 'character varying', true),
    ('Players', 'AuthToken', 'uuid', false),
    ('Players', 'CreatedAt', 'timestamp with time zone', false),
    ('Players', 'LastSeenAt', 'timestamp with time zone', true),
    ('Players', 'IsDeleted', 'boolean', false),
    ('Players', 'DeletedAt', 'timestamp with time zone', true),
    ('Players', 'CurrentStreak', 'integer', false),
    ('Players', 'LastPlayedDate', 'date', true),
    ('Players', 'IsAdmin', 'boolean', false),
    ('Players', 'StreakFreezes', 'integer', false),

    ('MagicLinkTokens', 'Id', 'integer', false),
    ('MagicLinkTokens', 'Email', 'character varying', false),
    ('MagicLinkTokens', 'TokenHash', 'character varying', false),
    ('MagicLinkTokens', 'ExpiresAt', 'timestamp with time zone', false),
    ('MagicLinkTokens', 'ConsumedAt', 'timestamp with time zone', true),
    ('MagicLinkTokens', 'CreatedAt', 'timestamp with time zone', false),

    ('EmailChangeTokens', 'Id', 'integer', false),
    ('EmailChangeTokens', 'PlayerId', 'uuid', false),
    ('EmailChangeTokens', 'NewEmail', 'character varying', false),
    ('EmailChangeTokens', 'TokenHash', 'character varying', false),
    ('EmailChangeTokens', 'ExpiresAt', 'timestamp with time zone', false),
    ('EmailChangeTokens', 'ConsumedAt', 'timestamp with time zone', true),
    ('EmailChangeTokens', 'CreatedAt', 'timestamp with time zone', false),

    ('DataProtectionKeys', 'Id', 'integer', false),
    ('DataProtectionKeys', 'FriendlyName', 'text', true),
    ('DataProtectionKeys', 'Xml', 'text', true),

    ('Settings', 'Id', 'integer', false),
    ('Settings', 'Key', 'character varying', false),
    ('Settings', 'Value', 'character varying', false),
    ('Settings', 'Description', 'character varying', true),
    ('Settings', 'UpdatedAt', 'timestamp with time zone', false),

    ('Tracks', 'Id', 'integer', false),
    ('Tracks', 'DeezerTrackId', 'bigint', false),
    ('Tracks', 'Artist', 'character varying', false),
    ('Tracks', 'Title', 'character varying', false),
    ('Tracks', 'CreatedAt', 'timestamp with time zone', false),
    ('Tracks', 'UpdatedAt', 'timestamp with time zone', true),
    ('Tracks', 'CoverHash', 'character varying', true),
    ('Tracks', 'HasPreview', 'boolean', false),
    ('Tracks', 'LastUsedDate', 'date', true),
    ('Tracks', 'UsageCount', 'integer', false),
    ('Tracks', 'ReleaseYear', 'integer', true),
    ('Tracks', 'IsDisabled', 'boolean', false),

    ('DailyChallenges', 'Id', 'integer', false),
    ('DailyChallenges', 'Date', 'date', false),
    ('DailyChallenges', 'Seed', 'integer', false),

    ('DailyChallengeTracks', 'Id', 'integer', false),
    ('DailyChallengeTracks', 'DailyChallengeId', 'integer', false),
    ('DailyChallengeTracks', 'TrackId', 'integer', false),
    ('DailyChallengeTracks', 'DeezerRankSnapshot', 'integer', false),
    ('DailyChallengeTracks', 'Position', 'integer', false),

    ('GameSessions', 'Id', 'integer', false),
    ('GameSessions', 'PlayerId', 'uuid', false),
    ('GameSessions', 'DailyChallengeId', 'integer', false),
    ('GameSessions', 'TotalScore', 'integer', false),
    ('GameSessions', 'TotalDurationSeconds', 'numeric', false),
    ('GameSessions', 'CreatedAt', 'timestamp with time zone', false),
    ('GameSessions', 'AbandonedAt', 'timestamp with time zone', true),
    ('GameSessions', 'CompletedAt', 'timestamp with time zone', true),
    ('GameSessions', 'Status', 'integer', false),
    ('GameSessions', 'CurrentTrackId', 'integer', true),
    ('GameSessions', 'CurrentTrackMinListenedSeconds', 'numeric', true),
    ('GameSessions', 'CurrentTrackHintLevelUsed', 'integer', false),
    ('GameSessions', 'FreezeEarned', 'boolean', false),
    ('GameSessions', 'FreezesUsed', 'integer', false),

    ('GameSessionAnswers', 'Id', 'integer', false),
    ('GameSessionAnswers', 'GameSessionId', 'integer', false),
    ('GameSessionAnswers', 'DailyChallengeTrackId', 'integer', false),
    ('GameSessionAnswers', 'ListenedDurationSeconds', 'numeric', false),
    ('GameSessionAnswers', 'WasExtended', 'boolean', false),
    ('GameSessionAnswers', 'ArtistAnswer', 'character varying', true),
    ('GameSessionAnswers', 'TitleAnswer', 'character varying', true),
    ('GameSessionAnswers', 'ArtistCorrect', 'boolean', false),
    ('GameSessionAnswers', 'TitleCorrect', 'boolean', false),
    ('GameSessionAnswers', 'Score', 'integer', false),
    ('GameSessionAnswers', 'HintLevelUsed', 'integer', false);

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
