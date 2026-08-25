/**
 * 顧客 PII の所在は `schema.prisma` の `/// @pii-model` / `/// @pii` が SSoT。
 *
 * ## なぜ
 *
 * 匿名化の網羅検査は fixture が書いた TOKEN しか見ない。schema から列を
 * 導いていなかったので、receipts / audit_logs / terms_agreements は構造的に
 * 不可視だった。列名から推定する規則 B は採らない — `Location.email` は
 * 事業者データで、顧客 PII ではない。
 *
 * ## 何を見るか
 *
 * - すべての model が `@pii-model holds` か `@pii-model none:<理由>` を持つ
 * - `holds` は locked の 15 model。uuid `@id` に `@pii` は要求しない
 * - `@pii` の strategy は `erase-on-anonymize` か `keep:<1 文字以上>`
 * - 走査下限: models > 60 / String 列 > 400 / holds の PII 列 > 40
 *
 * ## 直し方
 *
 * 新しい model には `@pii-model` を `model X {` の直前（既存 `///` ブロックが
 * あればその最終行）に書く。顧客 PII の String 列には `@pii` を列の直前行に書く。
 * 残す列は `keep:` の後に理由を置く。空の `keep:` は通らない。
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, test } from "bun:test";

import { readPiiManifest } from "../../support/pii-manifest";
import { readPrismaSchema } from "../../support/prisma-sources";

const ROOT = process.cwd();

const HOLDS_MODELS = [
  "Customer",
  "Reservation",
  "EventRegistration",
  "Inquiry",
  "InquiryReply",
  "InquiryAttachment",
  "PendingCustomerEmailChange",
  "PendingCustomerMerge",
  "User",
  "Session",
  "Receipt",
  "SpaceReview",
  "TermsAgreement",
  "AuditLog",
  "Verification",
] as const;

export function invalidPiiStrategies(
  columns: readonly {
    readonly model: string;
    readonly field: string;
    readonly strategy: string;
  }[],
): string[] {
  return columns
    .filter(
      (column) =>
        column.strategy !== "erase-on-anonymize" &&
        !/^keep:.+/u.test(column.strategy),
    )
    .map((column) => `${column.model}.${column.field}: ${column.strategy}`);
}

function listModelNames(source: string): string[] {
  const names: string[] = [];
  for (const raw of source.split(/\r?\n/u)) {
    const open = /^\s*model\s+(\w+)\s*\{/u.exec(raw.replace(/\/\/.*$/u, ""));
    if (open?.[1]) names.push(open[1]);
  }
  return names;
}

function countStringColumns(source: string): number {
  let count = 0;
  let model: string | null = null;
  for (const raw of source.split(/\r?\n/u)) {
    const line = raw.replace(/\/\/.*$/u, "");
    const open = /^\s*model\s+(\w+)\s*\{/u.exec(line);
    if (open?.[1]) {
      model = open[1];
      continue;
    }
    if (/^\s*\}/u.test(line)) {
      model = null;
      continue;
    }
    if (!model) continue;
    if (/^\s*(\w+)\s+String(\[\])?\??\s*/u.test(line)) count += 1;
  }
  return count;
}

function readFixture(name: string): string {
  return readFileSync(join(ROOT, "__tests__", "fixtures", name), "utf8");
}

describe("PII 宣言", () => {
  test("走査が空振りしていない（下限）", () => {
    const source = readPrismaSchema();
    const manifest = readPiiManifest(source);
    const models = listModelNames(source);

    expect(models.length).toBeGreaterThan(60);
    expect(manifest.models.length).toBeGreaterThan(60);
    expect(countStringColumns(source)).toBeGreaterThan(400);
    expect(manifest.columns.length).toBeGreaterThan(40);
  });

  test("すべての model が @pii-model を持つ", () => {
    const source = readPrismaSchema();
    const manifest = readPiiManifest(source);
    const declared = new Set(manifest.models.map((entry) => entry.name));
    const missing = listModelNames(source).filter(
      (name) => !declared.has(name),
    );

    expect(missing).toEqual([]);
  });

  test("holds は locked の 15 model と一致する", () => {
    const holds = readPiiManifest()
      .models.filter((entry) => entry.mode === "holds")
      .map((entry) => entry.name)
      .sort();

    expect(holds).toEqual([...HOLDS_MODELS].sort());
  });

  test("model mode は holds か none:<1 文字以上>", () => {
    const invalid = readPiiManifest()
      .models.filter(
        (entry) => entry.mode !== "holds" && !/^none:.+/u.test(entry.mode),
      )
      .map((entry) => `${entry.name}: ${entry.mode}`);

    expect(invalid).toEqual([]);
  });

  test("規則 A: uuid @id に @pii を要求しない", () => {
    const idColumns = readPiiManifest().columns.filter(
      (column) => column.field === "id",
    );

    expect(idColumns).toEqual([]);
  });

  test("規則 C: strategy は erase-on-anonymize か keep:<1 文字以上>", () => {
    expect(invalidPiiStrategies(readPiiManifest().columns)).toEqual([]);
  });

  test("落ちてはいけない書き方: きれいな fixture は通る", () => {
    const manifest = readPiiManifest(readFixture("pii-manifest-clean.prisma"));

    expect(manifest.models.map((entry) => entry.name)).toEqual([
      "Customer",
      "Receipt",
      "Location",
    ]);
    expect(
      manifest.columns.map((column) => `${column.model}.${column.field}`),
    ).toEqual([
      "Customer.email",
      "Customer.emailDeliveryReason",
      "Receipt.recipientName",
    ]);
    expect(invalidPiiStrategies(manifest.columns)).toEqual([]);
    expect(manifest.columns.some((column) => column.model === "Location")).toBe(
      false,
    );
  });

  test("落ちるべき書き方: holds 欠落と空の keep:", () => {
    const manifest = readPiiManifest(
      readFixture("pii-manifest-violations.prisma"),
    );

    expect(manifest.columns.map((column) => column.field)).not.toContain(
      "email",
    );
    expect(invalidPiiStrategies(manifest.columns)).not.toEqual([]);
  });

  test("holds を 1 model から外すと columns 下限が落ちる", () => {
    const source = readPrismaSchema();
    const original = readPiiManifest(source);
    const mutated = readPiiManifest(
      source.replace(
        new RegExp("/// @pii-model holds\\r?\\nmodel Customer \\{", "u"),
        "/// @pii-model none:mutated\nmodel Customer {",
      ),
    );

    expect(original.columns.length).toBeGreaterThan(40);
    expect(mutated.columns.length).not.toBeGreaterThan(40);
  });

  test("空の keep: は規則 C が落ちる", () => {
    const source = readPrismaSchema();
    const original = invalidPiiStrategies(readPiiManifest(source).columns);
    const mutated = invalidPiiStrategies(
      readPiiManifest(
        source.replace(
          "keep:適格請求書の記載事項。消法57条の4第6項・消令70条の13。課税期間末日の翌日から2か月を経過した日から7年保存（国税庁No.6625）。保存義務であり消去義務ではない",
          "keep:",
        ),
      ).columns,
    );

    expect(original).toEqual([]);
    expect(mutated.length).toBeGreaterThan(0);
  });
});
