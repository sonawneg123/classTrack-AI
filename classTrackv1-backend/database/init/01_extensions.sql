-- database/init/01_extensions.sql
--
-- Run automatically by PostgreSQL on first container start
-- (placed in /docker-entrypoint-initdb.d/).
--
-- Enables pgvector so the extension is available when Flyway migrations run.
-- The extension is prepared here for the future RAG phase; no vector tables
-- are created in this sprint.

CREATE EXTENSION IF NOT EXISTS vector;
