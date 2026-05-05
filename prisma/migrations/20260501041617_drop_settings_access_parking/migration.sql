-- Drop Settings.accessInfo and Settings.parkingInfo (display-only columns).
-- Multi-location SSoT: per-location access (Location.accessLines Jsonb[]) and parkingInfo (Location.parkingInfo).
-- Settings-level fallback was only used by buildFallbackLocation() when 0 Locations exist.
ALTER TABLE "settings" DROP COLUMN "accessInfo";
ALTER TABLE "settings" DROP COLUMN "parkingInfo";
