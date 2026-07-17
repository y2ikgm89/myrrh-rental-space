/**
 * RESERVATION_SERIES scope 対応（Phase B.2 task 10）
 *
 * `assertAllRequiredTermsAgreed`（queries.ts、新規・tx 対応版）と
 * `recordTermsAgreements`（commands.ts、新規・tx 対応版）を検証する。
 * どちらも既存の同名/類似関数（`terms-consent-gate.ts` の
 * `assertAllRequiredTermsAgreed` / `recordTermsAgreementsCommand`）とは別物で、
 * 既存 consumer は非破壊（そちらを使い続ける）。
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";

// =============================================================================
// Mocks (must precede module under test import — TDZ)
// =============================================================================

type TermsDocRow = { id: string; contentHtml?: string };

const mockTermsDocumentFindMany = mock<() => Promise<TermsDocRow[]>>(() =>
  Promise.resolve([]),
);
const mockTermsAgreementCreateMany = mock<() => Promise<{ count: number }>>(
  () => Promise.resolve({ count: 0 }),
);

mock.module("server-only", () => ({}));

// queries.ts の getPublishedTermsList 等が module scope で import する
// （assertAllRequiredTermsAgreed 自体は使わないが module 評価時に解決必須）
mock.module("next/cache", () => ({
  cacheLife: () => {},
  cacheTag: () => {},
  revalidateTag: mock(() => undefined),
  updateTag: mock(() => undefined),
}));

// commands.ts → media/managed-image-assertions が module scope で参照する
// （既存 __tests__/unit/domain/terms/commands.test.ts と同一 mock）
mock.module("@/shared/lib/env/server", () => ({
  serverEnv: {
    R2_PUBLIC_URL: "https://media.example.com",
  },
}));

// commands.ts が value import する Prisma.sql/join（order-sql.ts 経由でも参照される）。
// 既存 commands.test.ts と同一のトークン化スタブ。
mock.module("@generated/prisma/client", () => {
  const sql = (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): { __sql: string; __values: unknown[] } => {
    let combined = "";
    for (let i = 0; i < strings.length; i++) {
      combined += strings[i];
      if (i < values.length) combined += `$${i + 1}`;
    }
    return { __sql: combined, __values: values };
  };
  return {
    Prisma: {
      sql,
      join: (
        parts: { __sql: string; __values: unknown[] }[],
        separator = ",",
      ) => ({
        __sql: parts.map((p) => p.__sql).join(separator),
        __values: parts.flatMap((p) => p.__values),
      }),
      raw: (s: string) => ({ __sql: s, __values: [] }),
      JsonNull: "JsonNull",
    },
  };
});

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    termsDocument: { findMany: mockTermsDocumentFindMany },
    termsAgreement: { createMany: mockTermsAgreementCreateMany },
  },
}));

// eslint-disable-next-line import-x/first -- mock.module must precede imports
const { assertAllRequiredTermsAgreed } =
  await import("@/shared/domain/terms/queries");
// eslint-disable-next-line import-x/first -- mock.module must precede imports
const { recordTermsAgreements } =
  await import("@/shared/domain/terms/commands");

beforeEach(() => {
  mockTermsDocumentFindMany.mockReset();
  mockTermsAgreementCreateMany.mockReset();
  mockTermsAgreementCreateMany.mockResolvedValue({ count: 0 });
});

describe("Terms RESERVATION_SERIES scope (Phase B.2 task 10)", () => {
  test("assertAllRequiredTermsAgreed: RESERVATION_SERIES scope で 2 required doc、両方合意ずみ → OK", async () => {
    mockTermsDocumentFindMany.mockImplementation(() =>
      Promise.resolve([{ id: "doc-1" }, { id: "doc-2" }]),
    );

    await expect(
      assertAllRequiredTermsAgreed({
        scope: "RESERVATION_SERIES",
        agreements: [{ termsId: "doc-1" }, { termsId: "doc-2" }],
      }),
    ).resolves.toBeUndefined();
  });

  test("assertAllRequiredTermsAgreed: 未合意 doc あり → DomainError", async () => {
    mockTermsDocumentFindMany.mockImplementation(() =>
      Promise.resolve([{ id: "doc-1" }, { id: "doc-2" }]),
    );

    await expect(
      assertAllRequiredTermsAgreed({
        scope: "RESERVATION_SERIES",
        agreements: [{ termsId: "doc-1" }], // doc-2 が欠落
      }),
    ).rejects.toThrow("すべての必須規約への同意が必要です");
  });

  test("recordTermsAgreements: RESERVATION_SERIES scope で 3 required doc → 3 row createMany", async () => {
    mockTermsDocumentFindMany.mockImplementation(() =>
      Promise.resolve([
        { id: "doc-1", contentHtml: "<p>第1条</p>" },
        { id: "doc-2", contentHtml: "<p>第2条</p>" },
        { id: "doc-3", contentHtml: "<p>第3条</p>" },
      ]),
    );

    const result = await recordTermsAgreements({
      scope: "RESERVATION_SERIES",
      customerId: "cust-1",
      resourceId: "series-abc",
      agreements: [
        { termsId: "doc-1" },
        { termsId: "doc-2" },
        { termsId: "doc-3" },
      ],
    });

    expect(result).toHaveLength(3);
    expect(mockTermsAgreementCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            termsId: "doc-1",
            scope: "RESERVATION_SERIES",
            resourceId: "series-abc",
          }),
          expect.objectContaining({
            termsId: "doc-2",
            scope: "RESERVATION_SERIES",
            resourceId: "series-abc",
          }),
          expect.objectContaining({
            termsId: "doc-3",
            scope: "RESERVATION_SERIES",
            resourceId: "series-abc",
          }),
        ]),
      }),
    );
  });
});
