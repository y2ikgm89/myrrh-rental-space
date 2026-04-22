/**
 * Section Style preset seeder — Phase B.P2.
 *
 * Upserts the canonical 5 editorial presets on every seed run so the admin
 * Style Library (Phase B.P5) starts with meaningful defaults. Uses
 * `upsert({ where: { name }, create, update })` to stay idempotent — the
 * `@unique` constraint on `SectionStyle.name` backs this.
 *
 * Presets mirror `SECTION_STYLE_PRESETS` (`src/shared/domain/section-styles/types.ts`)
 * and the canonical inventory recorded in ADR 0017 §D1 / Phase B plan §AD-5.
 */
import type { AppPrismaClient } from "../src/shared/db/create-app-prisma-client";

// Kept inline (not imported from src/) to keep seed.ts boot path free of
// `server-only` re-export chains — see prisma-patterns.md §Better Auth 境界.
const PRESET_NAMES = {
  editorialStandard: "Editorial - Standard",
  editorialCompact: "Editorial - Compact",
  editorialCta: "Editorial - CTA",
  editorialHeroAdjacent: "Editorial - Hero Adjacent",
  editorialFullBleed: "Editorial - Full Bleed",
} as const;

type PresetBody = {
  description: string;
  spacing: { paddingTop: string; paddingBottom: string };
  background: { type: string; overlayOpacity: number };
  container: { maxWidth: string };
  typography: { titleSize: string; textAlign: string };
  animation: { preset: string };
};

const PRESETS: Record<string, PresetBody> = {
  [PRESET_NAMES.editorialStandard]: {
    description:
      "デフォルトの編集記事スタイル。標準的な縦余白 + 中央寄せ xl コンテナ。",
    spacing: { paddingTop: "lg", paddingBottom: "lg" },
    background: { type: "default", overlayOpacity: 0 },
    container: { maxWidth: "xl" },
    typography: { titleSize: "lg", textAlign: "left" },
    animation: { preset: "fade" },
  },
  [PRESET_NAMES.editorialCompact]: {
    description: "お知らせ帯など、縦余白を詰めた中央揃えセクション。",
    spacing: { paddingTop: "md", paddingBottom: "md" },
    background: { type: "default", overlayOpacity: 0 },
    container: { maxWidth: "xl" },
    typography: { titleSize: "md", textAlign: "center" },
    animation: { preset: "fade" },
  },
  [PRESET_NAMES.editorialCta]: {
    description:
      "CTA セクション用。surface 背景 + 中央見出し + lg コンテナで注意を集める。",
    spacing: { paddingTop: "md", paddingBottom: "md" },
    background: { type: "surface", overlayOpacity: 0 },
    container: { maxWidth: "lg" },
    typography: { titleSize: "xl", textAlign: "center" },
    animation: { preset: "fade" },
  },
  [PRESET_NAMES.editorialHeroAdjacent]: {
    description: "PageHero 直下のリストセクション向けに pt を抑えた縦リズム。",
    spacing: { paddingTop: "sm", paddingBottom: "lg" },
    background: { type: "default", overlayOpacity: 0 },
    container: { maxWidth: "xl" },
    typography: { titleSize: "lg", textAlign: "left" },
    animation: { preset: "fade" },
  },
  [PRESET_NAMES.editorialFullBleed]: {
    description:
      "画像カルーセル等の全幅セクション向け。縦余白なし + full maxWidth。",
    spacing: { paddingTop: "none", paddingBottom: "none" },
    background: { type: "default", overlayOpacity: 0 },
    container: { maxWidth: "full" },
    typography: { titleSize: "lg", textAlign: "center" },
    animation: { preset: "none" },
  },
};

export async function seedSectionStyles(
  prisma: AppPrismaClient,
): Promise<void> {
  console.info("🎨 Seeding Section Style presets...");
  let created = 0;
  let updated = 0;
  for (const [name, body] of Object.entries(PRESETS)) {
    const existing = await prisma.sectionStyle.findUnique({ where: { name } });
    await prisma.sectionStyle.upsert({
      where: { name },
      create: {
        name,
        description: body.description,
        scope: "section",
        spacing: body.spacing,
        background: body.background,
        container: body.container,
        typography: body.typography,
        animation: body.animation,
        applicableTypes: [],
      },
      update: {
        description: body.description,
        spacing: body.spacing,
        background: body.background,
        container: body.container,
        typography: body.typography,
        animation: body.animation,
      },
    });
    if (existing) {
      updated += 1;
    } else {
      created += 1;
    }
  }
  console.info(
    `   ✅ Section Style presets: ${created} created, ${updated} updated (${Object.keys(PRESETS).length} total)`,
  );
}
