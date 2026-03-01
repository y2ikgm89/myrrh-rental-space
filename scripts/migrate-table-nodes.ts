/**
 * Table Node Migration Script
 *
 * Lexical EditorState JSON 内の既存テーブルノード型名を変換する。
 * "type": "table"      → "type": "custom-table"
 * "type": "tablecell"  → "type": "custom-tablecell"
 *
 * 対象モデル: News, NewsVersion, Post, PostVersion, Section, FaqItem, TermsVersion
 *
 * 使用方法:
 *   bunx tsx scripts/migrate-table-nodes.ts --dry-run  # 変換対象確認のみ
 *   bunx tsx scripts/migrate-table-nodes.ts            # 本番実行
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, Prisma } from "../src/shared/generated/prisma/client";

const databaseUrl = process.env["DATABASE_URL"];
if (!databaseUrl) {
  console.error("DATABASE_URL 環境変数が設定されていません");
  process.exit(1);
}

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });
const DRY_RUN = process.argv.includes("--dry-run");

// =============================================================================
// 変換ロジック
// =============================================================================

function transformNode(node: Record<string, unknown>): Record<string, unknown> {
  const transformed = { ...node };

  if (transformed["type"] === "table") {
    transformed["type"] = "custom-table";
  } else if (transformed["type"] === "tablecell") {
    transformed["type"] = "custom-tablecell";
  }

  if (Array.isArray(transformed["children"])) {
    transformed["children"] = (
      transformed["children"] as Record<string, unknown>[]
    ).map(transformNode);
  }

  return transformed;
}

function transformContent(content: unknown): {
  changed: boolean;
  result: unknown;
} {
  if (!content || typeof content !== "object") {
    return { changed: false, result: content };
  }

  const original = JSON.stringify(content);
  const transformed = transformNode(content as Record<string, unknown>);
  const result = JSON.stringify(transformed);

  return {
    changed: original !== result,
    result: transformed,
  };
}

// =============================================================================
// 対象モデル処理
// =============================================================================

async function migrateModel<T extends { id: string }>(
  modelName: string,
  items: T[],
  getContent: (item: T) => unknown,
  updateFn: (id: string, content: unknown) => Promise<void>,
): Promise<{ changed: number; failed: number }> {
  let changed = 0;
  let failed = 0;

  for (const item of items) {
    try {
      const content = getContent(item);
      const { changed: isChanged, result } = transformContent(content);
      if (isChanged) {
        console.log(`  ${modelName} ${item.id}: 変換対象`);
        changed++;
        if (!DRY_RUN) {
          await updateFn(item.id, result);
        }
      }
    } catch (e) {
      console.error(`  ${modelName} ${item.id}: エラー`, e);
      failed++;
    }
  }

  return { changed, failed };
}

// =============================================================================
// メイン
// =============================================================================

async function main() {
  console.log(`実行モード: ${DRY_RUN ? "DRY RUN（変更なし）" : "本番実行"}`);
  console.log("");

  let totalChanged = 0;
  let totalFailed = 0;

  // News
  {
    console.log("News...");
    const items = await prisma.news.findMany({
      select: { id: true, contentJson: true },
      where: { contentJson: { not: Prisma.JsonNull } },
    });
    const { changed, failed } = await migrateModel(
      "News",
      items,
      (i) => i.contentJson,
      (id, content) =>
        prisma.news
          .update({
            where: { id },
            data: { contentJson: content as Prisma.InputJsonValue },
          })
          .then(() => undefined),
    );
    totalChanged += changed;
    totalFailed += failed;
  }

  // NewsVersion
  {
    console.log("NewsVersion...");
    const items = await prisma.newsVersion.findMany({
      select: { id: true, contentJson: true },
      where: { contentJson: { not: Prisma.JsonNull } },
    });
    const { changed, failed } = await migrateModel(
      "NewsVersion",
      items,
      (i) => i.contentJson,
      (id, content) =>
        prisma.newsVersion
          .update({
            where: { id },
            data: { contentJson: content as Prisma.InputJsonValue },
          })
          .then(() => undefined),
    );
    totalChanged += changed;
    totalFailed += failed;
  }

  // Post
  {
    console.log("Post...");
    const items = await prisma.post.findMany({
      select: { id: true, contentJson: true },
      where: { contentJson: { not: Prisma.JsonNull } },
    });
    const { changed, failed } = await migrateModel(
      "Post",
      items,
      (i) => i.contentJson,
      (id, content) =>
        prisma.post
          .update({
            where: { id },
            data: { contentJson: content as Prisma.InputJsonValue },
          })
          .then(() => undefined),
    );
    totalChanged += changed;
    totalFailed += failed;
  }

  // PostVersion
  {
    console.log("PostVersion...");
    const items = await prisma.postVersion.findMany({
      select: { id: true, contentJson: true },
      where: { contentJson: { not: Prisma.JsonNull } },
    });
    const { changed, failed } = await migrateModel(
      "PostVersion",
      items,
      (i) => i.contentJson,
      (id, content) =>
        prisma.postVersion
          .update({
            where: { id },
            data: { contentJson: content as Prisma.InputJsonValue },
          })
          .then(() => undefined),
    );
    totalChanged += changed;
    totalFailed += failed;
  }

  // Section
  {
    console.log("Section...");
    const items = await prisma.section.findMany({
      select: { id: true, contentJson: true },
      where: { contentJson: { not: Prisma.JsonNull } },
    });
    const { changed, failed } = await migrateModel(
      "Section",
      items,
      (i) => i.contentJson,
      (id, content) =>
        prisma.section
          .update({
            where: { id },
            data: { contentJson: content as Prisma.InputJsonValue },
          })
          .then(() => undefined),
    );
    totalChanged += changed;
    totalFailed += failed;
  }

  // FaqItem
  {
    console.log("FaqItem...");
    const items = await prisma.faqItem.findMany({
      select: { id: true, answerJson: true },
      where: { answerJson: { not: Prisma.JsonNull } },
    });
    const { changed, failed } = await migrateModel(
      "FaqItem",
      items,
      (i) => i.answerJson,
      (id, content) =>
        prisma.faqItem
          .update({
            where: { id },
            data: { answerJson: content as Prisma.InputJsonValue },
          })
          .then(() => undefined),
    );
    totalChanged += changed;
    totalFailed += failed;
  }

  // TermsVersion
  {
    console.log("TermsVersion...");
    const items = await prisma.termsVersion.findMany({
      select: { id: true, contentJson: true },
      where: { contentJson: { not: Prisma.JsonNull } },
    });
    const { changed, failed } = await migrateModel(
      "TermsVersion",
      items,
      (i) => i.contentJson,
      (id, content) =>
        prisma.termsVersion
          .update({
            where: { id },
            data: { contentJson: content as Prisma.InputJsonValue },
          })
          .then(() => undefined),
    );
    totalChanged += changed;
    totalFailed += failed;
  }

  console.log("");
  console.log(`完了: ${totalChanged} 件変換対象、${totalFailed} 件失敗`);

  if (DRY_RUN) {
    console.log(
      "DRY RUN: DB は変更されていません。--dry-run を外して再実行してください。",
    );
  } else {
    console.log("本番実行: DB を更新しました。");
  }
}

main()
  .catch((e) => {
    console.error("スクリプトエラー:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
