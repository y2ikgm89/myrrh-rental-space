-- ============================================================================
-- baseline prelude — extension
-- ============================================================================
--
-- **生成 DDL より前**に流す必要がある。schema.prisma の GIN index が
-- `gin_trgm_ops` を参照しており、pg_trgm が無いと
-- `operator class "gin_trgm_ops" does not exist` で CREATE INDEX が落ちる（実測）。
-- btree_gist は reservations の EXCLUDE 制約（invariants.sql）が使う。
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE EXTENSION IF NOT EXISTS pg_trgm;
