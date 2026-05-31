/**
 * hero / page-hero 背景メディア 単一 → 配列 移行スクリプト（一度きり・冪等）
 *
 * `Section.config` JSON の以下を単一オブジェクト → 配列に変換する:
 *   - type = "hero"      の `backgroundMedia`
 *   - type = "page-hero" (variant = "media") の `media`
 *
 * 使用方法:
 *   bun scripts/migrate-hero-background-media-to-array.ts            # 実移行
 *   bun scripts/migrate-hero-background-media-to-array.ts --dry-run  # 集計のみ（書込なし）
 *
 * 冪等: 既に配列の config は skip する。
 */

// Bun runtime が .env / .env.local を自動読み込みするため dotenv は不要。
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { isRecord } from "@/shared/lib/serialize";
import { toMediaArray } from "@/shared/lib/sections/migrations/media-array";
import { asPrismaInputJsonValue } from "@/shared/db/prisma-input-json";

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
  console.error("❌ DATABASE_URL が設定されていません");
  process.exit(1);
}

const isDryRun = process.argv.slice(2).includes("--dry-run");

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

/** type に応じた背景メディアフィールド名 */
function mediaKey(type: string): "backgroundMedia" | "media" | null {
  if (type === "hero") return "backgroundMedia";
  if (type === "page-hero") return "media";
  return null;
}

async function main() {
  const sections = await prisma.section.findMany({
    where: { type: { in: ["hero", "page-hero"] } },
    select: { id: true, type: true, config: true },
  });

  let converted = 0;
  let skipped = 0;

  for (const section of sections) {
    const key = mediaKey(section.type);
    if (key === null) continue;
    if (!isRecord(section.config)) {
      skipped++;
      continue;
    }

    const current = section.config[key];
    // page-hero は variant=media のときのみ media を持つ
    if (current === undefined) {
      skipped++;
      continue;
    }
    if (Array.isArray(current)) {
      skipped++;
      continue; // 冪等
    }

    const nextValue = toMediaArray(current);
    const nextConfig = { ...section.config, [key]: nextValue };

    console.log(
      `${isDryRun ? "[dry-run] " : ""}convert section ${section.id} (${section.type}.${key}) → ${nextValue.length} item(s)`,
    );

    if (!isDryRun) {
      await prisma.section.update({
        where: { id: section.id },
        data: {
          config: asPrismaInputJsonValue(
            nextConfig,
            "section config の形式が不正です",
          ),
        },
      });
    }
    converted++;
  }

  console.log(
    `\n${isDryRun ? "[dry-run] " : ""}done: ${converted} converted, ${skipped} skipped (already array / no media)`,
  );
  await prisma.$disconnect();
}

void main();
