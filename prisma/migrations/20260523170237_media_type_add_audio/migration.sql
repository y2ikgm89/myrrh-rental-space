-- Add AUDIO to MediaType enum (Phase 4 of MediaPicker modernization).
--
-- Phase 1 で audio MIME を MediaType.OTHER に派生する暫定方針だった
-- (`src/shared/lib/r2/media-type-derivation.ts` の Phase 4 TODO 参照)。
-- Phase 4 で Lexical Audio Node を MediaPicker 統合化するにあたり、
-- 正式な AUDIO enum 値を追加する additive migration。
--
-- 既存の MediaType.OTHER に派生した audio レコード（既に upload 済の音声）は
-- そのまま OTHER で残る — 公開動作には影響しないため明示 backfill は行わない
-- (新規 upload は AUDIO に派生、既存は OTHER に留まる)。

ALTER TYPE "MediaType" ADD VALUE 'AUDIO';
