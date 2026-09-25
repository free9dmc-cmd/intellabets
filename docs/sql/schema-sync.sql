-- IntellaBets schema-sync v2 (2026-09-25). Fixes the login and signup outage
-- (Prisma P2022: column User.premiumStripeSubId does not exist) by bringing the
-- web database up to web/prisma/schema.prisma at HEAD. Additive only, no data is
-- changed. Adds 3 columns to "User" (premiumStripeSubId, payoutsEnabled NOT NULL
-- DEFAULT false, preferredBook) and creates 4 tables (SupportTicket,
-- SupportMessage, PlacedBet, RateLimit) with 7 indexes and 3 foreign keys, all
-- with the exact names Prisma uses.
--
-- RUN: Neon console, SQL Editor, select the branch and database that the Vercel
-- DATABASE_URL points at, paste this WHOLE file, Run. Then run verify.sql.
--
-- SAFE TO RE-RUN. The file is ONE statement (a DO block), which Postgres runs as
-- ONE transaction: it applies completely or not at all. An editor that cut it at
-- every semicolon would only send fragments that fail with a syntax error, so
-- nothing would change. It refuses to touch anything but the web database. It
-- only creates what is missing: on an up-to-date database it changes nothing and
-- takes no locks on app tables. It waits at most 5 seconds for its brief lock on
-- "User", then gives up and rolls everything back.
--
-- RESULT: no error = applied. The NOTICE lists what was added and what was
-- already there. A WARNING about stray objects means an earlier manual fix left
-- misnamed objects behind: the app works, but review them before any future
-- prisma db push, which would try to DROP them. ERROR with REFUSED = wrong
-- database, nothing changed. Any other ERROR = nothing changed: after a lock
-- timeout just run it again, otherwise read the message and run verify.sql.
-- If the editor shows no messages at all, verify.sql shows the same information.
DO $$
DECLARE
  u regclass := to_regclass('public."User"');
  missing text;
  strays text;
  before text[];
  after text[];
  added text[];
  -- The 17 objects this script creates, and how to tell that each one exists.
  snapshot CONSTANT text := $q$
    SELECT coalesce(array_agg(obj ORDER BY ord), '{}') FROM (VALUES
      (1, 'table', 'SupportTicket', NULL), (2, 'table', 'SupportMessage', NULL),
      (3, 'table', 'PlacedBet', NULL), (4, 'table', 'RateLimit', NULL),
      (5, 'index', 'SupportTicket_status_createdAt_idx', 'SupportTicket'), (6, 'index', 'SupportTicket_userId_idx', 'SupportTicket'),
      (7, 'index', 'SupportMessage_ticketId_createdAt_idx', 'SupportMessage'), (8, 'index', 'PlacedBet_userId_status_idx', 'PlacedBet'),
      (9, 'index', 'PlacedBet_predictionId_idx', 'PlacedBet'), (10, 'index', 'PlacedBet_userId_externalId_key', 'PlacedBet'),
      (11, 'index', 'RateLimit_resetAt_idx', 'RateLimit'), (12, 'column', 'premiumStripeSubId', 'User'),
      (13, 'column', 'payoutsEnabled', 'User'), (14, 'column', 'preferredBook', 'User'),
      (15, 'fkey', 'SupportTicket_userId_fkey', 'SupportTicket'), (16, 'fkey', 'SupportMessage_ticketId_fkey', 'SupportMessage'),
      (17, 'fkey', 'PlacedBet_userId_fkey', 'PlacedBet')) o(ord, kind, obj, tbl)
    WHERE CASE kind
      WHEN 'table' THEN EXISTS (SELECT 1 FROM pg_class WHERE oid = to_regclass(format('public.%I', obj)) AND relkind = 'r')
      WHEN 'index' THEN EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass(format('public.%I', obj))
                                                        AND indrelid = to_regclass(format('public.%I', tbl)))
      WHEN 'column' THEN EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = to_regclass(format('public.%I', tbl))
                                                          AND attname = obj AND attnum > 0 AND NOT attisdropped)
      ELSE EXISTS (SELECT 1 FROM pg_constraint WHERE conname = obj AND contype = 'f'
                                                 AND conrelid = to_regclass(format('public.%I', tbl)))
    END $q$;
BEGIN
  -- Give up on any lock after 5s instead of queueing behind a long query and
  -- stalling the site. is_local = true makes this transaction-local, like SET
  -- LOCAL: it ends with this DO block and cannot leak into the editor session.
  PERFORM set_config('lock_timeout', '5s', true);
  -- 1. Guard. The web "User" has all four columns. The Render engine (backend)
  --    "User" lacks premiumSince, stripeCustomerId and stripeAccountId.
  IF u IS NULL THEN
    RAISE EXCEPTION 'IntellaBets schema-sync REFUSED, nothing was changed: database "%" has no table public."User", so it is not the IntellaBets web database. Select the database that the Vercel DATABASE_URL points at and run it again.', current_database();
  END IF;
  missing := (SELECT string_agg(c, ', ' ORDER BY o)
              FROM unnest(ARRAY['premiumSince', 'stripeCustomerId', 'stripeAccountId', 'subscriptionPrice']) WITH ORDINALITY g(c, o)
              WHERE NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid = u AND attname = c AND attnum > 0 AND NOT attisdropped));
  IF missing IS NOT NULL THEN
    RAISE EXCEPTION 'IntellaBets schema-sync REFUSED, nothing was changed: public."User" in database "%" lacks the web app columns %. %Select the database that the Vercel DATABASE_URL points at and run it again.', current_database(), missing,
      CASE WHEN missing LIKE 'premiumSince, stripeCustomerId, stripeAccountId%' THEN 'This is probably the Render engine (backend) database, not the web one. ' ELSE '' END;
  END IF;
  EXECUTE snapshot INTO before;
  -- Every DDL statement below sits inside its own IF: it runs only when needed,
  -- and an editor that splits at semicolons can never send it on its own.
  -- 2. New tables
  IF 'SupportTicket' <> ALL (before) THEN
    CREATE TABLE IF NOT EXISTS "public"."SupportTicket" (
      "id" TEXT NOT NULL, "userId" TEXT, "subject" TEXT NOT NULL,
      "category" TEXT NOT NULL DEFAULT 'other', "priority" TEXT NOT NULL DEFAULT 'normal',
      "status" TEXT NOT NULL DEFAULT 'open', "diagnostics" JSONB,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" TIMESTAMP(3) NOT NULL, "resolvedAt" TIMESTAMP(3),
      CONSTRAINT "SupportTicket_pkey" PRIMARY KEY ("id"));
  END IF;
  IF 'SupportMessage' <> ALL (before) THEN
    CREATE TABLE IF NOT EXISTS "public"."SupportMessage" (
      "id" TEXT NOT NULL, "ticketId" TEXT NOT NULL, "role" TEXT NOT NULL, "content" TEXT NOT NULL,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "SupportMessage_pkey" PRIMARY KEY ("id"));
  END IF;
  IF 'PlacedBet' <> ALL (before) THEN
    CREATE TABLE IF NOT EXISTS "public"."PlacedBet" (
      "id" TEXT NOT NULL, "userId" TEXT NOT NULL, "predictionId" TEXT,
      "matchup" TEXT NOT NULL, "sport" TEXT NOT NULL, "book" TEXT NOT NULL,
      "selection" TEXT NOT NULL, "marketType" TEXT NOT NULL,
      "oddsDecimal" DOUBLE PRECISION NOT NULL, "oddsAmerican" TEXT NOT NULL,
      "stake" DOUBLE PRECISION NOT NULL, "potentialPayout" DOUBLE PRECISION NOT NULL,
      "status" TEXT NOT NULL DEFAULT 'pending', "actualPayout" DOUBLE PRECISION,
      "profit" DOUBLE PRECISION, "settledAt" TIMESTAMP(3),
      "source" TEXT NOT NULL DEFAULT 'manual', "externalId" TEXT,
      "placedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PlacedBet_pkey" PRIMARY KEY ("id"));
  END IF;
  IF 'RateLimit' <> ALL (before) THEN
    CREATE TABLE IF NOT EXISTS "public"."RateLimit" (
      "key" TEXT NOT NULL, "count" INTEGER NOT NULL DEFAULT 1, "resetAt" TIMESTAMP(3) NOT NULL,
      CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("key"));
  END IF;
  -- 3. Indexes on the new tables (instant: the tables are empty)
  IF 'SupportTicket_status_createdAt_idx' <> ALL (before) THEN
    CREATE INDEX IF NOT EXISTS "SupportTicket_status_createdAt_idx" ON "public"."SupportTicket"("status", "createdAt");
  END IF;
  IF 'SupportTicket_userId_idx' <> ALL (before) THEN
    CREATE INDEX IF NOT EXISTS "SupportTicket_userId_idx" ON "public"."SupportTicket"("userId");
  END IF;
  IF 'SupportMessage_ticketId_createdAt_idx' <> ALL (before) THEN
    CREATE INDEX IF NOT EXISTS "SupportMessage_ticketId_createdAt_idx" ON "public"."SupportMessage"("ticketId", "createdAt");
  END IF;
  IF 'PlacedBet_userId_status_idx' <> ALL (before) THEN
    CREATE INDEX IF NOT EXISTS "PlacedBet_userId_status_idx" ON "public"."PlacedBet"("userId", "status");
  END IF;
  IF 'PlacedBet_predictionId_idx' <> ALL (before) THEN
    CREATE INDEX IF NOT EXISTS "PlacedBet_predictionId_idx" ON "public"."PlacedBet"("predictionId");
  END IF;
  IF 'PlacedBet_userId_externalId_key' <> ALL (before) THEN
    CREATE UNIQUE INDEX IF NOT EXISTS "PlacedBet_userId_externalId_key" ON "public"."PlacedBet"("userId", "externalId");
  END IF;
  IF 'RateLimit_resetAt_idx' <> ALL (before) THEN
    CREATE INDEX IF NOT EXISTS "RateLimit_resetAt_idx" ON "public"."RateLimit"("resetAt");
  END IF;
  -- 4. All three "User" columns in ONE statement, so its exclusive lock is taken
  --    once. Metadata only (nullable, constant default): no table rewrite.
  IF NOT before @> ARRAY['premiumStripeSubId', 'payoutsEnabled', 'preferredBook'] THEN
    ALTER TABLE "public"."User"
      ADD COLUMN IF NOT EXISTS "premiumStripeSubId" TEXT,
      ADD COLUMN IF NOT EXISTS "payoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
      ADD COLUMN IF NOT EXISTS "preferredBook" TEXT;
  END IF;
  -- 5. Foreign keys
  IF 'SupportTicket_userId_fkey' <> ALL (before) THEN
    ALTER TABLE "public"."SupportTicket" ADD CONSTRAINT "SupportTicket_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF 'SupportMessage_ticketId_fkey' <> ALL (before) THEN
    ALTER TABLE "public"."SupportMessage" ADD CONSTRAINT "SupportMessage_ticketId_fkey"
      FOREIGN KEY ("ticketId") REFERENCES "public"."SupportTicket"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF 'PlacedBet_userId_fkey' <> ALL (before) THEN
    ALTER TABLE "public"."PlacedBet" ADD CONSTRAINT "PlacedBet_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  -- 6. Post-check: all 17 must exist now, otherwise roll everything back.
  EXECUTE snapshot INTO after;
  IF cardinality(after) <> 17 THEN
    RAISE EXCEPTION 'IntellaBets schema-sync FAILED, nothing was changed: only % of 17 objects exist afterwards (%). An object with one of the other names but of the wrong kind or on the wrong table is in the way. Run verify.sql for details.', cardinality(after), array_to_string(after, ', ');
  END IF;
  added := ARRAY(SELECT x FROM unnest(after) x WHERE x <> ALL (before));
  -- 7. Strays: misnamed copies of the new "User" columns or tables (such as an
  --    unquoted manual fix leaves), and columns, indexes or foreign keys on the
  --    new tables that Prisma does not define. Reported, never dropped.
  strays := (SELECT string_agg(s, ', ' ORDER BY s) FROM (
    SELECT format('column "User".%I', attname) AS s FROM pg_attribute WHERE attrelid = u AND attnum > 0 AND NOT attisdropped
       AND lower(replace(attname, '_', '')) IN ('premiumstripesubid', 'payoutsenabled', 'preferredbook')
       AND attname NOT IN ('premiumStripeSubId', 'payoutsEnabled', 'preferredBook')
    UNION ALL
    SELECT format('table %I', relname) FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind IN ('r', 'p')
       AND regexp_replace(lower(replace(relname, '_', '')), 's$', '') IN ('supportticket', 'supportmessage', 'placedbet', 'ratelimit')
       AND relname NOT IN ('SupportTicket', 'SupportMessage', 'PlacedBet', 'RateLimit')
    UNION ALL
    SELECT format('column %I.%I', c.relname, a.attname) FROM pg_attribute a JOIN pg_class c ON c.oid = a.attrelid
     WHERE c.relnamespace = 'public'::regnamespace AND a.attnum > 0 AND NOT a.attisdropped
       AND a.attname <> ALL (string_to_array(CASE c.relname
         WHEN 'SupportTicket' THEN 'id,userId,subject,category,priority,status,diagnostics,createdAt,updatedAt,resolvedAt'
         WHEN 'SupportMessage' THEN 'id,ticketId,role,content,createdAt'
         WHEN 'PlacedBet' THEN 'id,userId,predictionId,matchup,sport,book,selection,marketType,oddsDecimal,oddsAmerican,stake,potentialPayout,status,actualPayout,profit,settledAt,source,externalId,placedAt,createdAt'
         WHEN 'RateLimit' THEN 'key,count,resetAt' END, ','))
    UNION ALL
    SELECT format('index %I on %I', i.relname, t.relname) FROM pg_index x
      JOIN pg_class i ON i.oid = x.indexrelid JOIN pg_class t ON t.oid = x.indrelid
     WHERE t.relnamespace = 'public'::regnamespace AND t.relname IN ('SupportTicket', 'SupportMessage', 'PlacedBet', 'RateLimit')
       AND i.relname <> ALL (after || ARRAY['SupportTicket_pkey', 'SupportMessage_pkey', 'PlacedBet_pkey', 'RateLimit_pkey'])
    UNION ALL
    SELECT format('foreign key %I on %I', k.conname, t.relname) FROM pg_constraint k JOIN pg_class t ON t.oid = k.conrelid
     WHERE k.contype = 'f' AND t.relnamespace = 'public'::regnamespace
       AND t.relname IN ('SupportTicket', 'SupportMessage', 'PlacedBet', 'RateLimit') AND k.conname <> ALL (after)) z);
  IF strays IS NOT NULL THEN
    RAISE WARNING 'IntellaBets schema-sync: the fix WAS applied, but these stray objects are not in the Prisma schema (probably left by an earlier manual fix): %. They were left untouched and do not break the app. A future prisma db push would try to DROP them, and any data in them, so review them first.', strays;
  END IF;
  -- 8. Summary
  RAISE NOTICE 'IntellaBets schema-sync OK on database "%": added % of 17 objects (%). Already present: % (%). %Next, run verify.sql.',
    current_database(), cardinality(added), coalesce(nullif(array_to_string(added, ', '), ''), 'nothing, it was already up to date'),
    cardinality(before), CASE cardinality(before) WHEN 0 THEN 'none' WHEN 17 THEN 'all' ELSE array_to_string(before, ', ') END,
    CASE WHEN strays IS NULL THEN 'No stray objects. ' ELSE 'Stray objects found, see the WARNING above. ' END;
END
$$;
