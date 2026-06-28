/**
 * terms Lexical コンテンツ同期ワーカー（bun test + JSDOM preload 経由でのみ実行）
 *
 * Usage:
 *   bun scripts/generate-terms-repair-migration.ts [--apply-local]
 */

import { describe, expect, test } from "bun:test";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { tryConvertHtmlStringToLexicalJsonCore } from "@/admin/components/editor/lexical/html-to-lexical-json-core";
import { deriveLexicalContentHtmlFromJsonCore } from "@/admin/components/editor/lexical/preview/derive-lexical-content-html-core";
import { isLegacyFlatLexicalJson } from "@/shared/lib/lexical/is-legacy-flat-lexical-json";

const SHOULD_RUN = process.env["GENERATE_TERMS_REPAIR"] === "1";
const APPLY_LOCAL = process.env["APPLY_LOCAL"] === "1";
const MIGRATION_NAME = "20260627120000_terms_lexical_content_sync";

function pgDollarQuote(value: string, tag: string): string {
  let candidate = tag;
  while (value.includes(`$${candidate}$`)) {
    candidate = `${candidate}_x`;
  }
  return `$${candidate}$${value}$${candidate}$`;
}

function repairTagFromId(id: string): string {
  return id.replace(/-/gu, "_");
}

describe("repair terms contentJson worker", () => {
  test.skipIf(!SHOULD_RUN)(
    "sync all terms: legacy JSON repair + contentHtml derived from contentJson",
    async () => {
      const connectionString =
        process.env["REPAIR_DATABASE_URL"] ?? process.env["DATABASE_URL"];
      if (!connectionString) {
        throw new Error("REPAIR_DATABASE_URL or DATABASE_URL is required");
      }

      const adapter = new PrismaPg({ connectionString });
      const prisma = new PrismaClient({ adapter });

      const docs = await prisma.termsDocument.findMany({
        where: { deletedAt: null },
        select: { id: true, slug: true, contentHtml: true, contentJson: true },
        orderBy: { slug: "asc" },
      });

      const updates: string[] = [
        "-- ============================================================================",
        "-- terms_lexical_content_sync — Lexical 公式パイプラインで contentJson / contentHtml を同期",
        "--",
        "-- 1. legacy flat contentJson → 既存 contentHtml から構造化 JSON へ修復",
        "-- 2. 全行: contentJson から server 派生 HTML（保存時と同一パイプライン）で contentHtml を更新",
        "--",
        "-- idempotency: 再実行しても同一 contentJson なら同一 HTML が再生成される。",
        "-- 生成: bun scripts/generate-terms-repair-migration.ts",
        "-- ============================================================================",
        "",
      ];

      let syncedCount = 0;

      for (const doc of docs) {
        const jsonBefore =
          typeof doc.contentJson === "string"
            ? doc.contentJson
            : JSON.stringify(doc.contentJson);

        let contentJson = jsonBefore;

        if (isLegacyFlatLexicalJson(jsonBefore)) {
          const converted = tryConvertHtmlStringToLexicalJsonCore(
            doc.contentHtml,
          );
          expect(converted.ok).toBe(true);
          if (!converted.ok) {
            continue;
          }
          expect(isLegacyFlatLexicalJson(converted.json)).toBe(false);
          contentJson = converted.json;
        }

        const contentHtml = deriveLexicalContentHtmlFromJsonCore(contentJson);
        const tag = repairTagFromId(doc.id);

        if (APPLY_LOCAL) {
          const parsedContentJson: unknown = JSON.parse(contentJson);
          if (
            typeof parsedContentJson !== "object" ||
            parsedContentJson === null
          ) {
            throw new Error("contentJson must parse to an object");
          }
          await prisma.termsDocument.update({
            where: { id: doc.id },
            data: {
              contentJson: parsedContentJson,
              contentHtml,
            },
          });
        }

        updates.push(
          `UPDATE "terms_documents"`,
          `SET`,
          `  "contentJson" = ${pgDollarQuote(contentJson, `json_${tag}`)}::json,`,
          `  "contentHtml" = ${pgDollarQuote(contentHtml, `html_${tag}`)},`,
          `  "updatedAt" = NOW()`,
          `WHERE "id" = '${doc.id}'::uuid AND "deletedAt" IS NULL;`,
          "",
        );

        syncedCount += 1;
      }

      expect(syncedCount).toBeGreaterThan(0);

      const migrationDir = join(
        process.cwd(),
        "prisma",
        "migrations",
        MIGRATION_NAME,
      );
      mkdirSync(migrationDir, { recursive: true });
      writeFileSync(
        join(migrationDir, "migration.sql"),
        updates.join("\n"),
        "utf8",
      );

      await prisma.$disconnect();
    },
  );
});
