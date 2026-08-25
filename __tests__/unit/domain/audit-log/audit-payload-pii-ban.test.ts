/**
 * 監査 JSON ペイロードに顧客 PII キーを載せられないことを、型で固定する。
 *
 * ## なぜ
 *
 * C-PR3a/3b で値の書込は止めた。残る穴は「同じキー名でまた値を載せる」こと。
 * 代入可能性で禁止キーを閉じ、schema との一致 gate は置かない
 * （リストは schema から導いていない。逆方向も見ない）。
 *
 * ## 何を見るか
 *
 * 代入可能性を型レベルで判定する。`@ts-expect-error` は使わない
 * （どの行のどのエラーを期待しているのかが表現できないため）。
 * 「通ってはいけない形」と「通らなければならない形」を両方置く。
 *
 * ## 直し方
 *
 * ここが落ちたら、`AuditJsonPayload` か `PII_AUDIT_KEYS` が緩められている。
 * 緩めた側を戻す。ネスト / `as` / `targetEmail` のような別名は型では止めない。
 */

import { describe, expect, test } from "bun:test";

import { Prisma } from "@generated/prisma/client";

import type { AuditLogInput, BulkAuditRecord } from "@/admin/lib/audit";
import type { CreateAuditLogRecordInput } from "@/shared/domain/audit-log/commands";
import {
  PII_AUDIT_KEYS,
  type AuditJsonPayload,
  type PiiAuditKey,
} from "@/shared/lib/privacy/pii-audit-keys";

import { readPiiManifest } from "../../../support/pii-manifest";
import { readPrismaSchema } from "../../../support/prisma-sources";

/**
 * 代入可能性。**タプルで包んで分配を止める** — 包まないと union が各要素に
 * 分配され、`(2 | 3) extends 3` が `boolean` になって `= true` が通ってしまう
 * （実測でこれを踏んだ）。
 */
type Assignable<A, B> = [A] extends [B] ? true : false;

type PayloadOrJsonNull = AuditJsonPayload | typeof Prisma.JsonNull;

const SCHEMA_EXCLUDED_KEYS = ["filename", "note", "query"] as const;

/** 通らなければならない形: 変更フィールド名だけ。 */
const acceptsChangedFields: Assignable<
  { changedFields: string[]; customerType: string },
  AuditJsonPayload
> = true;

/** 通らなければならない形: 検索の件数メタ。 */
const acceptsQueryLength: Assignable<
  { queryLength: number; resultCount: number },
  AuditJsonPayload
> = true;

/** 通らなければならない形: リクエスト文脈。`ipAddress` は禁止しない。 */
const acceptsIpAddress: Assignable<
  { ipAddress: string; userAgent: string },
  AuditJsonPayload
> = true;

/** 通らなければならない形: 既存の未分化 JSON。 */
const acceptsUnknownRecord: Assignable<
  Record<string, unknown>,
  AuditJsonPayload
> = true;

/** 通ってはいけない形: 顧客氏名。 */
const rejectsLastName: Assignable<{ lastName: string }, AuditJsonPayload> =
  false;

/** 通ってはいけない形: 検索クエリ本文。 */
const rejectsQuery: Assignable<{ query: string }, AuditJsonPayload> = false;

/** 通ってはいけない形: 領収書宛名。 */
const rejectsRecipientName: Assignable<
  { recipientName: string },
  AuditJsonPayload
> = false;

const createOldValueIsPayload: Assignable<
  NonNullable<CreateAuditLogRecordInput["oldValue"]>,
  PayloadOrJsonNull
> = true;
const createNewValueIsPayload: Assignable<
  NonNullable<CreateAuditLogRecordInput["newValue"]>,
  PayloadOrJsonNull
> = true;
const createMetadataIsPayload: Assignable<
  NonNullable<CreateAuditLogRecordInput["metadata"]>,
  PayloadOrJsonNull
> = true;

const adminOldValueIsPayload: Assignable<
  NonNullable<AuditLogInput["oldValue"]>,
  PayloadOrJsonNull
> = true;
const adminNewValueIsPayload: Assignable<
  NonNullable<AuditLogInput["newValue"]>,
  PayloadOrJsonNull
> = true;
const adminMetadataIsPayload: Assignable<
  NonNullable<AuditLogInput["metadata"]>,
  PayloadOrJsonNull
> = true;

const bulkOldValueIsPayload: Assignable<
  NonNullable<BulkAuditRecord["oldValue"]>,
  PayloadOrJsonNull
> = true;

const createOldValueAcceptsJsonNull: Assignable<
  typeof Prisma.JsonNull,
  NonNullable<CreateAuditLogRecordInput["oldValue"]>
> = true;
const adminOldValueAcceptsJsonNull: Assignable<
  typeof Prisma.JsonNull,
  NonNullable<AuditLogInput["oldValue"]>
> = true;
const bulkOldValueAcceptsJsonNull: Assignable<
  typeof Prisma.JsonNull,
  NonNullable<BulkAuditRecord["oldValue"]>
> = true;

function listSchemaFields(source: string): {
  model: string;
  field: string;
}[] {
  const fields: { model: string; field: string }[] = [];
  let model: string | null = null;

  for (const raw of source.split(/\r?\n/u)) {
    const line = raw.replace(/\/\/.*$/u, "");
    const open = /^\s*model\s+(\w+)\s*\{/u.exec(line);
    if (open?.[1]) {
      model = open[1];
      continue;
    }
    if (model && /^\s*\}/u.test(line)) {
      model = null;
      continue;
    }
    if (!model) continue;

    const field = /^\s*(\w+)\s+(\w+)/u.exec(line);
    if (field?.[1] && field[2] && !field[1].startsWith("@@")) {
      fields.push({ model, field: field[1] });
    }
  }

  return fields;
}

function modelsMissingPiiTag(
  key: PiiAuditKey,
  fields: readonly { model: string; field: string }[],
  declaredModels: ReadonlySet<string>,
): string[] {
  return fields
    .filter((entry) => entry.field === key)
    .map((entry) => entry.model)
    .filter((model) => !declaredModels.has(model));
}

describe("監査ペイロードの顧客 PII キー禁止", () => {
  test("型レベルの判定がすべて意図どおり", () => {
    expect([
      acceptsChangedFields,
      acceptsQueryLength,
      acceptsIpAddress,
      acceptsUnknownRecord,
      createOldValueIsPayload,
      createNewValueIsPayload,
      createMetadataIsPayload,
      adminOldValueIsPayload,
      adminNewValueIsPayload,
      adminMetadataIsPayload,
      bulkOldValueIsPayload,
      createOldValueAcceptsJsonNull,
      adminOldValueAcceptsJsonNull,
      bulkOldValueAcceptsJsonNull,
    ]).toEqual([
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
      true,
    ]);
    expect([rejectsLastName, rejectsQuery, rejectsRecipientName]).toEqual([
      false,
      false,
      false,
    ]);
  });

  test("禁止キーは 20 を超える", () => {
    expect(PII_AUDIT_KEYS.length).toBeGreaterThan(20);
  });

  test("スキーマに存在する禁止キーは @pii-model model にだけ属する", () => {
    const source = readPrismaSchema();
    const fields = listSchemaFields(source);
    const declaredModels = new Set(
      readPiiManifest(source).models.map((entry) => entry.name),
    );
    const excluded = new Set<string>(SCHEMA_EXCLUDED_KEYS);
    const compared = PII_AUDIT_KEYS.filter((key) => !excluded.has(key)).filter(
      (key) => fields.some((entry) => entry.field === key),
    );
    const missingTag = compared.flatMap((key) =>
      modelsMissingPiiTag(key, fields, declaredModels).map(
        (model) => `${model}.${key}`,
      ),
    );

    expect(fields.length).toBeGreaterThan(100);
    expect(compared.length).toBeGreaterThan(10);
    expect(missingTag).toEqual([]);
  });
});
