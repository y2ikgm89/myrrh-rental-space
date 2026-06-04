/**
 * ホーム features(order=3「選ばれる理由」) セクションの過大な上下余白を是正する一回限りスクリプト
 *
 * home の content セクションは showcase(lg) → features(lg) → cta(lg) と padded セクションが
 * 連続し、各境界で pb+pt が二重計上されて desktop 260px / mobile 130px の死に余白が生じていた。
 * features(order=3) の layout.padding を lg → none にして交互リズム
 * (showcase:padded → features:none → cta:padded) を復元し、全境界を単側 --space-lg(130/65px) に揃える。
 *
 * seed は既存セクションの config を更新しないため別途バックフィルが必要
 * (DEFAULT_PAGE_SECTIONS.home の同変更は fresh seed のみに反映される)。
 *
 * 冪等 — layout.padding が旧 default "lg" のセクションのみ "none" に更新する
 * (admin が手動変更済みの値は上書きしない)。
 *
 * 使用方法:
 *   bun scripts/backfill-home-section-spacing.ts            # 実移行
 *   bun scripts/backfill-home-section-spacing.ts --dry-run  # 対象集計のみ (書込なし)
 */

// Bun runtime が .env / .env.local を自動読み込みするため dotenv は不要。
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../generated/prisma/client";
import { isRecord } from "@/shared/lib/serialize";

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
  console.error("❌ DATABASE_URL が設定されていません");
  process.exit(1);
}

const isDryRun = process.argv.slice(2).includes("--dry-run");

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

// 旧 default のみ是正対象 (admin 手動変更を保護)
const OLD_PADDING = "lg";
const NEW_PADDING = "none";

async function main() {
  const page = await prisma.page.findFirst({
    where: { slug: "home" },
    select: { id: true },
  });
  if (!page) {
    console.log("⚠️ home ページが見つかりません — スキップ");
    return;
  }

  const target = await prisma.section.findFirst({
    where: { pageId: page.id, order: 3, type: "features" },
    select: { id: true, config: true },
  });
  if (!target) {
    console.log(
      "⚠️ home の features(order=3) セクションが見つかりません — スキップ",
    );
    return;
  }

  const config = target.config;
  if (!isRecord(config)) {
    console.log("⚠️ config が object ではありません — スキップ");
    return;
  }
  const layout = isRecord(config["layout"]) ? config["layout"] : {};
  const current = layout["padding"];

  if (current !== OLD_PADDING) {
    console.log(
      `⏭️  既に padding="${current ?? "(none)"}" のためスキップ (旧 default "${OLD_PADDING}" のみ是正)`,
    );
    return;
  }

  const nextConfig = {
    ...config,
    layout: { ...layout, padding: NEW_PADDING },
  };

  console.log(
    `${isDryRun ? "[dry-run] " : ""}home features(order=3) padding "${OLD_PADDING}" → "${NEW_PADDING}" (section ${target.id})`,
  );

  if (!isDryRun) {
    await prisma.section.update({
      where: { id: target.id },
      data: { config: nextConfig },
    });
  }

  console.log(
    `✅ home section spacing backfill done${isDryRun ? " (dry-run)" : ""}`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (error) => {
    console.error(
      "❌ home section spacing backfill failed:",
      error instanceof Error ? error.message : String(error),
    );
    await prisma.$disconnect();
    process.exitCode = 1;
  });
