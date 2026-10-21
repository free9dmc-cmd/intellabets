-- The web app and the prediction engine keep separate databases and separate
-- user tables (see README, "The two-database split"). POSTGRES_DB creates the
-- web database; this adds the engine's.
CREATE DATABASE intellabets_engine;
