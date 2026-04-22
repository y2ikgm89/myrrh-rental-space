/**
 * migrate-section-design-to-style.ts — Phase B.P3
 *
 * One-time data migration: Section.design (deprecated) → Section.styleId
 *
 * Algorithm:
 *  1. Fetch all Sections with their `design` JSON and current `styleId`.
 *  2. Skip any Section that already has a non-null `styleId` (idempotency).
 *  3. For each unique `design` value (keyed by sha256 hash of canonical JSON):
 *     a. If it matches one of the 5 seed presets exactly → reuse preset id.
 *     b. Otherwise → create a new SectionStyle named
 *        "Editorial - Auto Migrated N" (scope="section", applicableTypes=[]).
 *  4. Update Section.styleId for all non-skipped sections.
 *  5. Append a migration log to prisma/migrations/section-design-migration-log.json.
 *
 * Usage: bun scripts/migrate-section-design-to-style.ts
 *
 * Idempotency: run twice → second run sees all styleId non-null → 0 migrated.
 */

import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../generated/prisma/client";
import { createAppPrismaClient } from "@/shared/db/create-app-prisma-client";
import { createHash } from "crypto";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SectionRow {
  id: string;
  type: string;
  design: unknown;
  styleId: string | null;
}

interface LogEntry {
  sectionId: string;
  oldDesign: unknown;
  newStyleId: string;
  styleName: string;
  createdNew: boolean;
  migratedAt: string;
}

// ---------------------------------------------------------------------------
// Seed preset fingerprints (matches prisma/seed-section-styles.ts definitions)
// ---------------------------------------------------------------------------

type PresetBody = {
  spacing: object;
  background: object;
  container: object;
  typography: object;
  animation: object;
};

const SEED_PRESETS: Record<string, PresetBody> = {
  "Editorial - Standard": {
    spacing: { paddingTop: "lg", paddingBottom: "lg" },
    background: { type: "default", overlayOpacity: 0 },
    container: { maxWidth: "xl" },
    typography: { titleSize: "lg", textAlign: "left" },
    animation: { preset: "fade" },
  },
  "Editorial - Compact": {
    spacing: { paddingTop: "md", paddingBottom: "md" },
    background: { type: "default", overlayOpacity: 0 },
    container: { maxWidth: "xl" },
    typography: { titleSize: "md", textAlign: "center" },
    animation: { preset: "fade" },
  },
  "Editorial - CTA": {
    spacing: { paddingTop: "md", paddingBottom: "md" },
    background: { type: "surface", overlayOpacity: 0 },
    container: { maxWidth: "lg" },
    typography: { titleSize: "xl", textAlign: "center" },
    animation: { preset: "fade" },
  },
  "Editorial - Hero Adjacent": {
    spacing: { paddingTop: "sm", paddingBottom: "lg" },
    background: { type: "default", overlayOpacity: 0 },
    container: { maxWidth: "xl" },
    typography: { titleSize: "lg", textAlign: "left" },
    animation: { preset: "fade" },
  },
  "Editorial - Full Bleed": {
    spacing: { paddingTop: "none", paddingBottom: "none" },
    background: { type: "default", overlayOpacity: 0 },
    container: { maxWidth: "full" },
    typography: { titleSize: "lg", textAlign: "center" },
    animation: { preset: "none" },
  },
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Produce a canonical, deterministic JSON string: objects with keys sorted
 * alphabetically, string values trimmed.
 */
function canonicalize(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (typeof value === "string") return JSON.stringify(value.trim());
  if (typeof value === "number" || typeof value === "boolean") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return "[" + value.map(canonicalize).join(",") + "]";
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const sortedKeys = Object.keys(obj).sort();
    const pairs = sortedKeys.map((k) => {
      return `${JSON.stringify(k)}:${canonicalize(obj[k])}`;
    });
    return "{" + pairs.join(",") + "}";
  }
  return JSON.stringify(value);
}

function sha256(str: string): string {
  return createHash("sha256").update(str).digest("hex");
}

function fingerprint(design: unknown): string {
  return sha256(canonicalize(design));
}

/**
 * Check whether a Section.design value matches one of the seed presets.
 * Returns the preset name if matched, null otherwise.
 */
function findMatchingPreset(design: unknown): string | null {
  const designFp = fingerprint(design);
  for (const [name, body] of Object.entries(SEED_PRESETS)) {
    if (fingerprint(body) === designFp) return name;
  }
  return null;
}

/** Append or create the migration log file. */
function appendLog(logPath: string, entries: LogEntry[]): void {
  let existing: LogEntry[] = [];
  if (existsSync(logPath)) {
    try {
      const raw = readFileSync(logPath, "utf8");
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        existing = parsed as LogEntry[];
      }
    } catch {
      // Corrupt log — start fresh
    }
  }
  writeFileSync(
    logPath,
    JSON.stringify([...existing, ...entries], null, 2),
    "utf8",
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    throw new Error("DATABASE_URL environment variable is not set");
  }

  // Use the same pattern as seed.ts
  const { Pool } = await import("pg");
  const pool = new Pool({
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 300_000,
  });
  const adapter = new PrismaPg(pool);
  const baseClient = new PrismaClient({ adapter });
  const prisma = createAppPrismaClient(baseClient);

  try {
    console.log("📦 Section.design → Section.styleId migration (Phase B.P3)");

    // Step 1: Fetch all sections
    const sections = (await prisma.section.findMany({
      select: { id: true, type: true, design: true, styleId: true },
    })) as SectionRow[];

    // Step 2: Partition into skipped vs to-migrate
    const toMigrate = sections.filter((s) => s.styleId === null);
    const skipped = sections.length - toMigrate.length;

    if (toMigrate.length === 0) {
      console.log(
        `✅ 0 sections migrated, 0 new styles created, ${skipped} skipped (all already have styleId)`,
      );
      return;
    }

    // Step 3: Group sections by design fingerprint
    const fingerprintToSections = new Map<string, SectionRow[]>();
    for (const section of toMigrate) {
      const fp = fingerprint(section.design);
      const group = fingerprintToSections.get(fp) ?? [];
      group.push(section);
      fingerprintToSections.set(fp, group);
    }

    // Step 4: Fetch existing seed presets from DB
    const allStyles = await prisma.sectionStyle.findMany({
      select: { id: true, name: true },
    });
    const presetNameToId = new Map<string, string>(
      allStyles.map((s) => [s.name, s.id]),
    );

    let migrated = 0;
    let created = 0;
    let autoMigratedCounter = 1;
    const logEntries: LogEntry[] = [];

    // Step 5: Resolve each unique design group
    for (const [fp, group] of fingerprintToSections.entries()) {
      const firstSection = group[0];
      if (!firstSection) continue;

      const sampleDesign = firstSection.design;

      // Determine styleId for this design fingerprint
      let resolvedStyleId: string;
      let styleName: string;
      let createdNew = false;

      const matchedPresetName = findMatchingPreset(sampleDesign);
      if (matchedPresetName !== null) {
        // Reuse existing preset
        const presetId = presetNameToId.get(matchedPresetName);
        if (!presetId) {
          // Preset not seeded — create it (shouldn't happen in normal flow)
          console.warn(
            `  ⚠️  Preset "${matchedPresetName}" matched but not found in DB; creating new style`,
          );
          const d0 = isRecord(sampleDesign) ? sampleDesign : {};
          const newStyle = await prisma.sectionStyle.create({
            data: {
              name: `Editorial - Auto Migrated ${autoMigratedCounter++}`,
              description: "Auto-migrated from Section.design",
              scope: "section",
              applicableTypes: [],
              spacing: toInputJson(
                isRecord(d0["spacing"])
                  ? d0["spacing"]
                  : { paddingTop: "md", paddingBottom: "md" },
              ),
              background: toInputJson(
                isRecord(d0["background"])
                  ? d0["background"]
                  : { type: "default", overlayOpacity: 0 },
              ),
              container: toInputJson(
                isRecord(d0["container"])
                  ? d0["container"]
                  : { maxWidth: "xl" },
              ),
              typography: toInputJson(
                isRecord(d0["typography"])
                  ? d0["typography"]
                  : { titleSize: "md", textAlign: "left" },
              ),
              animation: toInputJson(
                isRecord(d0["animation"])
                  ? d0["animation"]
                  : { preset: "fade" },
              ),
            },
          });
          resolvedStyleId = newStyle.id;
          styleName = newStyle.name;
          createdNew = true;
          created++;
        } else {
          resolvedStyleId = presetId;
          styleName = matchedPresetName;
        }
      } else {
        // No preset match — create a new SectionStyle from the design JSON
        const design = isRecord(sampleDesign) ? sampleDesign : {};
        const newStyle = await prisma.sectionStyle.create({
          data: {
            name: `Editorial - Auto Migrated ${autoMigratedCounter++}`,
            description: "Auto-migrated from Section.design",
            scope: "section",
            applicableTypes: [],
            spacing: toInputJson(
              isRecord(design["spacing"])
                ? design["spacing"]
                : { paddingTop: "md", paddingBottom: "md" },
            ),
            background: toInputJson(
              isRecord(design["background"])
                ? design["background"]
                : { type: "default", overlayOpacity: 0 },
            ),
            container: toInputJson(
              isRecord(design["container"])
                ? design["container"]
                : { maxWidth: "xl" },
            ),
            typography: toInputJson(
              isRecord(design["typography"])
                ? design["typography"]
                : { titleSize: "md", textAlign: "left" },
            ),
            animation: toInputJson(
              isRecord(design["animation"])
                ? design["animation"]
                : { preset: "fade" },
            ),
          },
        });
        resolvedStyleId = newStyle.id;
        styleName = newStyle.name;
        createdNew = true;
        created++;
      }

      // Step 6: Update all sections in this fingerprint group
      const sectionIds = group.map((s) => s.id);
      await prisma.section.updateMany({
        where: { id: { in: sectionIds } },
        data: { styleId: resolvedStyleId },
      });

      migrated += sectionIds.length;

      // Build log entries
      for (const s of group) {
        logEntries.push({
          sectionId: s.id,
          oldDesign: s.design,
          newStyleId: resolvedStyleId,
          styleName,
          createdNew,
          migratedAt: new Date().toISOString(),
        });
      }

      console.log(
        `  ${createdNew ? "✨" : "♻️ "} ${styleName} (fp:${fp.slice(0, 8)}) → ${sectionIds.length} section(s)`,
      );
    }

    // Step 7: Write migration log
    const logPath = join(
      process.cwd(),
      "prisma",
      "migrations",
      "section-design-migration-log.json",
    );
    appendLog(logPath, logEntries);

    console.log(
      `\n✅ ${migrated} sections migrated, ${created} new styles created, ${skipped} skipped`,
    );
    console.log(
      `📄 Migration log written to prisma/migrations/section-design-migration-log.json`,
    );
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}

/** Runtime narrowing helper (same contract as @/shared/lib/serialize.isRecord) */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Cast a Record<string, unknown> to Prisma.InputJsonObject.
 * Allowed exception per type-safety.md §Prisma JSON 型 — seed / CLI scripts use this
 * at the Prisma API boundary where InputJsonObject is required.
 */
function toInputJson(obj: Record<string, unknown>): Prisma.InputJsonObject {
   
  return obj as Prisma.InputJsonObject;
}

void main().catch((err: unknown) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
