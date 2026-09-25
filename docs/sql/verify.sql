-- IntellaBets verify v2: checks that schema-sync.sql did its job.
-- READ-ONLY and safe to re-run on any database: it is one SELECT on the system
-- catalogs plus a count of the "User" rows. It writes nothing.
--
-- RUN: Neon console, SQL Editor, same database as schema-sync.sql, paste the
-- WHOLE file, Run. Rows come in this order:
--   SUMMARY  OK = everything the app needs is there with the right shape.
--            NOT OK = see the rows marked MISSING (absent) or MISMATCH (wrong
--            shape, the detail says what was found and what was expected).
--   then one row per expected object (22 checks)
--   STRAY    only if misnamed or extra objects exist that the Prisma schema does
--            not define (for example left by an earlier manual fix). Harmless to
--            the app, but a future prisma db push would try to DROP them.
--   CONTEXT  database name, number of users and newest signup: confirm this is
--            the real production data and not an empty branch. Also names the
--            owner of the tables, with a WARNING if the new tables ended up
--            owned by a different role than "User".
-- The definitive whole-schema check, from web/ with DATABASE_URL set:
--   npx prisma migrate diff --from-url "$DATABASE_URL" --to-schema-datamodel prisma/schema.prisma --exit-code
WITH
col(ord, t, c, typ, nn, dflt) AS (VALUES
 (1, 'User', 'premiumStripeSubId', 'text', false, NULL), (2, 'User', 'payoutsEnabled', 'boolean', true, 'false'),
 (3, 'User', 'preferredBook', 'text', false, NULL),
 (10, 'SupportTicket', 'id', 'text', true, NULL), (11, 'SupportTicket', 'userId', 'text', false, NULL),
 (12, 'SupportTicket', 'subject', 'text', true, NULL), (13, 'SupportTicket', 'category', 'text', true, '''other''::text'),
 (14, 'SupportTicket', 'priority', 'text', true, '''normal''::text'), (15, 'SupportTicket', 'status', 'text', true, '''open''::text'),
 (16, 'SupportTicket', 'diagnostics', 'jsonb', false, NULL),
 (17, 'SupportTicket', 'createdAt', 'timestamp(3) without time zone', true, 'CURRENT_TIMESTAMP'),
 (18, 'SupportTicket', 'updatedAt', 'timestamp(3) without time zone', true, NULL),
 (19, 'SupportTicket', 'resolvedAt', 'timestamp(3) without time zone', false, NULL),
 (20, 'SupportMessage', 'id', 'text', true, NULL), (21, 'SupportMessage', 'ticketId', 'text', true, NULL),
 (22, 'SupportMessage', 'role', 'text', true, NULL), (23, 'SupportMessage', 'content', 'text', true, NULL),
 (24, 'SupportMessage', 'createdAt', 'timestamp(3) without time zone', true, 'CURRENT_TIMESTAMP'),
 (30, 'PlacedBet', 'id', 'text', true, NULL), (31, 'PlacedBet', 'userId', 'text', true, NULL),
 (32, 'PlacedBet', 'predictionId', 'text', false, NULL), (33, 'PlacedBet', 'matchup', 'text', true, NULL),
 (34, 'PlacedBet', 'sport', 'text', true, NULL), (35, 'PlacedBet', 'book', 'text', true, NULL),
 (36, 'PlacedBet', 'selection', 'text', true, NULL), (37, 'PlacedBet', 'marketType', 'text', true, NULL),
 (38, 'PlacedBet', 'oddsDecimal', 'double precision', true, NULL), (39, 'PlacedBet', 'oddsAmerican', 'text', true, NULL),
 (40, 'PlacedBet', 'stake', 'double precision', true, NULL), (41, 'PlacedBet', 'potentialPayout', 'double precision', true, NULL),
 (42, 'PlacedBet', 'status', 'text', true, '''pending''::text'), (43, 'PlacedBet', 'actualPayout', 'double precision', false, NULL),
 (44, 'PlacedBet', 'profit', 'double precision', false, NULL),
 (45, 'PlacedBet', 'settledAt', 'timestamp(3) without time zone', false, NULL),
 (46, 'PlacedBet', 'source', 'text', true, '''manual''::text'), (47, 'PlacedBet', 'externalId', 'text', false, NULL),
 (48, 'PlacedBet', 'placedAt', 'timestamp(3) without time zone', true, 'CURRENT_TIMESTAMP'),
 (49, 'PlacedBet', 'createdAt', 'timestamp(3) without time zone', true, 'CURRENT_TIMESTAMP'),
 (50, 'RateLimit', 'key', 'text', true, NULL), (51, 'RateLimit', 'count', 'integer', true, '1'),
 (52, 'RateLimit', 'resetAt', 'timestamp(3) without time zone', true, NULL)),
tbl(ord, t) AS (VALUES (1, 'SupportTicket'), (2, 'SupportMessage'), (3, 'PlacedBet'), (4, 'RateLimit')),
idx(ord, name, t, uniq, cols) AS (VALUES
 (1, 'SupportTicket_status_createdAt_idx', 'SupportTicket', false, 'status,createdAt'),
 (2, 'SupportTicket_userId_idx', 'SupportTicket', false, 'userId'),
 (3, 'SupportMessage_ticketId_createdAt_idx', 'SupportMessage', false, 'ticketId,createdAt'),
 (4, 'PlacedBet_userId_status_idx', 'PlacedBet', false, 'userId,status'),
 (5, 'PlacedBet_predictionId_idx', 'PlacedBet', false, 'predictionId'),
 (6, 'PlacedBet_userId_externalId_key', 'PlacedBet', true, 'userId,externalId'),
 (7, 'RateLimit_resetAt_idx', 'RateLimit', false, 'resetAt')),
con(ord, name, t, kind, cols, ref, refcols, del, upd) AS (VALUES
 (1, 'SupportTicket_pkey', 'SupportTicket', 'p', 'id', NULL, NULL, NULL, NULL),
 (2, 'SupportMessage_pkey', 'SupportMessage', 'p', 'id', NULL, NULL, NULL, NULL),
 (3, 'PlacedBet_pkey', 'PlacedBet', 'p', 'id', NULL, NULL, NULL, NULL),
 (4, 'RateLimit_pkey', 'RateLimit', 'p', 'key', NULL, NULL, NULL, NULL),
 (5, 'SupportTicket_userId_fkey', 'SupportTicket', 'f', 'userId', 'User', 'id', 'n', 'c'),
 (6, 'SupportMessage_ticketId_fkey', 'SupportMessage', 'f', 'ticketId', 'SupportTicket', 'id', 'c', 'c'),
 (7, 'PlacedBet_userId_fkey', 'PlacedBet', 'f', 'userId', 'User', 'id', 'c', 'c')),
rel AS (SELECT c.oid, c.relname, c.relkind, c.relowner FROM pg_class c WHERE c.relnamespace = 'public'::regnamespace),
att AS (SELECT a.attrelid, a.attnum, a.attname, format_type(a.atttypid, a.atttypmod) AS typ,
               a.attnotnull AS nn, pg_get_expr(d.adbin, d.adrelid) AS dflt
        FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
        WHERE a.attnum > 0 AND NOT a.attisdropped),
-- expected column vs what is there (NULL attname = column absent)
colcheck AS (
 SELECT col.*, r.oid AS relid, a.attname, a.typ AS ftyp, a.nn AS fnn, a.dflt AS fdflt,
        CASE WHEN a.attname IS NULL THEN 'MISSING'
             WHEN a.typ <> col.typ OR a.nn <> col.nn OR a.dflt IS DISTINCT FROM col.dflt THEN 'MISMATCH' ELSE 'OK' END AS st,
        col.c || ': expected ' || col.typ || CASE WHEN col.nn THEN ' NOT NULL' ELSE ' NULL' END || coalesce(' DEFAULT ' || col.dflt, '')
          || CASE WHEN a.attname IS NULL THEN ', not found'
                  ELSE ', found ' || a.typ || CASE WHEN a.nn THEN ' NOT NULL' ELSE ' NULL' END || coalesce(' DEFAULT ' || a.dflt, '') END AS info
 FROM col LEFT JOIN rel r ON r.relname = col.t AND r.relkind IN ('r', 'p') LEFT JOIN att a ON a.attrelid = r.oid AND a.attname = col.c),
checks AS (
 -- 1. "User" has every column the HEAD Prisma client selects on login and signup
 SELECT 1 AS grp, 0 AS ord, 'table' AS kind, 'User' AS object,
        CASE WHEN r.oid IS NULL OR m.missing IS NOT NULL THEN 'MISSING' ELSE 'OK' END AS status,
        CASE WHEN r.oid IS NULL THEN 'table does not exist'
             WHEN m.missing IS NULL THEN 'all ' || m.n || ' columns the app reads are present'
             ELSE 'the app reads ' || m.n || ' columns, missing: ' || m.missing END AS detail
 FROM (SELECT 1) one LEFT JOIN rel r ON r.relname = 'User' AND r.relkind IN ('r', 'p')
 LEFT JOIN LATERAL (SELECT count(*) AS n, string_agg(c, ', ' ORDER BY o) FILTER (WHERE NOT EXISTS
            (SELECT 1 FROM att WHERE att.attrelid = r.oid AND att.attname = c)) AS missing
     FROM unnest(ARRAY['id', 'email', 'username', 'name', 'image', 'password', 'isPremium', 'premiumSince',
       'premiumUntil', 'stripeCustomerId', 'stripeAccountId', 'premiumStripeSubId', 'payoutsEnabled', 'bio',
       'specialties', 'subscriptionPrice', 'preferredBook', 'totalWins', 'totalLosses', 'totalPushes', 'winRate',
       'roi', 'totalEarnings', 'subscriberCount', 'isVerified', 'createdAt', 'updatedAt']) WITH ORDINALITY u(c, o)) m ON true
 UNION ALL
 -- 2. the three new "User" columns, exact type, nullability and default
 SELECT 1, ord, 'column', 'User.' || c, st, info FROM colcheck WHERE t = 'User'
 UNION ALL
 -- 3. the four new tables, with every column checked
 SELECT 1, 10 + tbl.ord, 'table', tbl.t,
        CASE WHEN r.oid IS NULL THEN 'MISSING' WHEN bad.n > 0 THEN 'MISMATCH' ELSE 'OK' END,
        CASE WHEN r.oid IS NULL THEN 'table does not exist'
             WHEN bad.n = 0 THEN 'all ' || bad.total || ' columns match'
             ELSE bad.n || ' of ' || bad.total || ' columns wrong: ' || bad.list END
 FROM tbl LEFT JOIN rel r ON r.relname = tbl.t AND r.relkind IN ('r', 'p')
 LEFT JOIN LATERAL (SELECT count(*) AS total, count(*) FILTER (WHERE st <> 'OK') AS n,
                           string_agg(info, ' | ' ORDER BY ord) FILTER (WHERE st <> 'OK') AS list
                    FROM colcheck WHERE colcheck.t = tbl.t) bad ON true
 UNION ALL
 -- 4. indexes: right table, uniqueness and column order
 SELECT 1, 20 + idx.ord, 'index', idx.name,
        CASE WHEN i.indexrelid IS NULL THEN 'MISSING'
             WHEN t.relname IS DISTINCT FROM idx.t OR i.indisunique <> idx.uniq OR k.cols IS DISTINCT FROM idx.cols THEN 'MISMATCH' ELSE 'OK' END,
        'expected ' || CASE WHEN idx.uniq THEN 'UNIQUE ' ELSE '' END || idx.t || '(' || idx.cols || ')'
          || CASE WHEN i.indexrelid IS NULL THEN ', not found'
                  ELSE ', found ' || CASE WHEN i.indisunique THEN 'UNIQUE ' ELSE '' END || t.relname || '(' || k.cols || ')' END
 FROM idx LEFT JOIN rel ir ON ir.relname = idx.name AND ir.relkind = 'i' LEFT JOIN pg_index i ON i.indexrelid = ir.oid
 LEFT JOIN rel t ON t.oid = i.indrelid
 LEFT JOIN LATERAL (SELECT string_agg(a.attname, ',' ORDER BY u.o) AS cols
                    FROM unnest(i.indkey::int2[]) WITH ORDINALITY u(n, o)
                    JOIN att a ON a.attrelid = i.indrelid AND a.attnum = u.n) k ON true
 UNION ALL
 -- 5. primary and foreign keys: table, columns, target and ON DELETE / ON UPDATE
 SELECT 1, 30 + con.ord, CASE con.kind WHEN 'p' THEN 'primary key' ELSE 'foreign key' END, con.name,
        CASE WHEN pc.oid IS NULL THEN 'MISSING'
             WHEN t.relname IS DISTINCT FROM con.t OR pc.contype::text <> con.kind OR k.cols IS DISTINCT FROM con.cols
               OR (con.kind = 'f' AND (f.relname IS DISTINCT FROM con.ref OR fk.cols IS DISTINCT FROM con.refcols
                   OR pc.confdeltype::text <> con.del OR pc.confupdtype::text <> con.upd)) THEN 'MISMATCH' ELSE 'OK' END,
        'expected ' || con.t || '(' || con.cols || ')' || coalesce(' -> ' || con.ref || '(' || con.refcols || ')', '')
          || CASE con.del WHEN 'n' THEN ' ON DELETE SET NULL' WHEN 'c' THEN ' ON DELETE CASCADE' ELSE '' END
          || CASE con.upd WHEN 'c' THEN ' ON UPDATE CASCADE' ELSE '' END
          || CASE WHEN pc.oid IS NULL THEN ', not found' ELSE ', found on ' || t.relname || ': ' || pg_get_constraintdef(pc.oid) END
 FROM con
 LEFT JOIN pg_constraint pc ON pc.conname = con.name AND pc.conrelid = (SELECT oid FROM rel WHERE relname = con.t AND relkind IN ('r', 'p'))
 LEFT JOIN rel t ON t.oid = pc.conrelid LEFT JOIN rel f ON f.oid = pc.confrelid
 LEFT JOIN LATERAL (SELECT string_agg(a.attname, ',' ORDER BY u.o) AS cols FROM unnest(pc.conkey) WITH ORDINALITY u(n, o)
                    JOIN att a ON a.attrelid = pc.conrelid AND a.attnum = u.n) k ON true
 LEFT JOIN LATERAL (SELECT string_agg(a.attname, ',' ORDER BY u.o) AS cols FROM unnest(pc.confkey) WITH ORDINALITY u(n, o)
                    JOIN att a ON a.attrelid = pc.confrelid AND a.attnum = u.n) fk ON true),
-- Same stray rules as schema-sync.sql: misnamed copies of the new "User" columns
-- or tables, and columns, indexes or foreign keys on the new tables that Prisma
-- does not define.
strays AS (
 SELECT 'column' AS kind, 'User.' || a.attname AS object,
        'misnamed copy of a new User column: ' || a.typ || CASE WHEN a.nn THEN ' NOT NULL' ELSE ' NULL' END AS detail
 FROM rel r JOIN att a ON a.attrelid = r.oid
 WHERE r.relname = 'User' AND r.relkind IN ('r', 'p')
   AND lower(replace(a.attname, '_', '')) IN ('premiumstripesubid', 'payoutsenabled', 'preferredbook')
   AND a.attname NOT IN ('premiumStripeSubId', 'payoutsEnabled', 'preferredBook')
 UNION ALL
 SELECT 'table', r.relname, 'misnamed copy of a new table, ' || (SELECT count(*) FROM att WHERE att.attrelid = r.oid) || ' columns'
 FROM rel r WHERE r.relkind IN ('r', 'p')
   AND regexp_replace(lower(replace(r.relname, '_', '')), 's$', '') IN ('supportticket', 'supportmessage', 'placedbet', 'ratelimit')
   AND r.relname NOT IN ('SupportTicket', 'SupportMessage', 'PlacedBet', 'RateLimit')
 UNION ALL
 SELECT 'column', r.relname || '.' || a.attname, 'column not in the Prisma schema: ' || a.typ || CASE WHEN a.nn THEN ' NOT NULL' ELSE ' NULL' END
 FROM tbl JOIN rel r ON r.relname = tbl.t AND r.relkind IN ('r', 'p') JOIN att a ON a.attrelid = r.oid
 WHERE NOT EXISTS (SELECT 1 FROM col WHERE col.t = tbl.t AND col.c = a.attname)
 UNION ALL
 SELECT 'index', i.relname, 'index not in the Prisma schema, on ' || t.relname || ': ' || pg_get_indexdef(i.oid)
 FROM tbl JOIN rel t ON t.relname = tbl.t AND t.relkind IN ('r', 'p') JOIN pg_index x ON x.indrelid = t.oid JOIN rel i ON i.oid = x.indexrelid
 WHERE i.relname NOT IN (SELECT name FROM idx UNION ALL SELECT name FROM con WHERE kind = 'p')
 UNION ALL
 SELECT 'foreign key', k.conname, 'foreign key not in the Prisma schema, on ' || t.relname || ': ' || pg_get_constraintdef(k.oid)
 FROM tbl JOIN rel t ON t.relname = tbl.t AND t.relkind IN ('r', 'p') JOIN pg_constraint k ON k.conrelid = t.oid AND k.contype = 'f'
 WHERE k.conname NOT IN (SELECT name FROM con WHERE kind = 'f')),
-- Table owners: the app connects as one role, so the new tables should belong
-- to the same role as "User" (a different editor role would own them otherwise).
own AS (SELECT count(DISTINCT relowner) AS n, min(pg_get_userbyid(relowner)::text) AS one,
               string_agg(relname || ' ' || pg_get_userbyid(relowner), ', ' ORDER BY relname) AS list
        FROM rel WHERE relkind IN ('r', 'p') AND relname IN ('User', 'SupportTicket', 'SupportMessage', 'PlacedBet', 'RateLimit')),
-- Row count and newest signup. The count runs through query_to_xml only so that
-- this file still works (instead of failing) on a database without "User".
ctx AS (
 SELECT CASE WHEN r.oid IS NULL THEN 'no public."User" table: this is not the IntellaBets web database'
             ELSE 'User rows: ' || coalesce(substring(q.x FROM '<n>([^<]*)</n>'), '?')
                  || ', newest User.createdAt: ' || coalesce(substring(q.x FROM '<m>([^<]*)</m>'), 'none')
                  || CASE WHEN own.n <= 1 THEN ', tables owned by ' || own.one
                          ELSE '. WARNING, table owners differ (' || own.list || '): a role that owns only "User" may get permission denied on the others' END
        END AS detail
 FROM (SELECT to_regclass('public."User"') AS oid) r CROSS JOIN own
 LEFT JOIN LATERAL (SELECT query_to_xml('SELECT count(*) AS n, '
          || CASE WHEN EXISTS (SELECT 1 FROM att WHERE attrelid = r.oid AND attname = 'createdAt') THEN 'max("createdAt")' ELSE 'NULL::text' END
          || ' AS m FROM public."User"', false, false, '')::text AS x WHERE r.oid IS NOT NULL) q ON true)
SELECT kind, object, status, detail FROM (
 SELECT 0 AS grp, 0 AS ord, 'SUMMARY' AS kind, current_database()::text AS object,
        CASE WHEN count(*) FILTER (WHERE status <> 'OK') = 0 THEN 'OK' ELSE 'NOT OK' END AS status,
        count(*) FILTER (WHERE status = 'OK') || ' of ' || count(*) || ' checks OK, '
        || count(*) FILTER (WHERE status = 'MISSING') || ' missing, '
        || count(*) FILTER (WHERE status = 'MISMATCH') || ' mismatched'
        || CASE WHEN (SELECT count(*) FROM strays) > 0
                THEN '. Also ' || (SELECT count(*) FROM strays) || ' STRAY object(s), see below: harmless to the app, but a future prisma db push would try to DROP them'
                ELSE '. No stray objects' END
        || CASE WHEN (SELECT n FROM own) > 1 THEN '. Table owners differ, see CONTEXT' ELSE '' END AS detail
 FROM checks
 UNION ALL
 SELECT grp, ord, kind, object, status, detail FROM checks
 UNION ALL
 SELECT 2, row_number() OVER (ORDER BY kind, object), kind, object, 'STRAY', detail FROM strays
 UNION ALL
 SELECT 3, 0, 'CONTEXT', current_database(), 'INFO', detail FROM ctx
) s
ORDER BY grp, ord;
