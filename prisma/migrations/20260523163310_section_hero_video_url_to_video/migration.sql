-- Rename `videoUrl` → `video` in hero section config (string URL preserved as-is).
--
-- Phase 3 of MediaPicker modernization: hero.videoUrl: field.url() is replaced by
-- hero.video: field.media({ accept: "video" }) which also stores a string URL.
-- Source detection (R2 vs YouTube vs Vimeo) is derived at render time by
-- `detectVideoProvider()` (src/shared/lib/video/url-detect.ts) — no object form.
--
-- Existing records that already have `video` (idempotent re-runs / future drift)
-- are left untouched. Records without `videoUrl` get no change.

UPDATE sections
SET config = (config - 'videoUrl') || jsonb_build_object(
  'video',
  COALESCE(config -> 'videoUrl', '""'::jsonb)
)
WHERE type = 'hero'
  AND config ? 'videoUrl'
  AND NOT (config ? 'video');
