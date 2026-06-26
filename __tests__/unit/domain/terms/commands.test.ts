import { describe, test, expect, mock, beforeEach } from "bun:test";

// =============================================================================
// Mocks (must precede module under test import — TDZ)
// =============================================================================

type TermsDocument = {
  id: string;
  slug: string;
  contentHtml: string;
  isPublished: boolean;
  publishedAt: Date | null;
  deletedAt: Date | null;
};

const mockFindFirst = mock<() => Promise<Partial<TermsDocument> | null>>(() =>
  Promise.resolve(null),
);
const mockFindUnique = mock<() => Promise<Partial<TermsDocument> | null>>(() =>
  Promise.resolve(null),
);
const mockFindMany = mock<
  () => Promise<Array<Pick<TermsDocument, "id" | "contentHtml">>>
>(() => Promise.resolve([]));
const mockCreate = mock<() => Promise<{ id: string; slug: string }>>(() =>
  Promise.resolve({ id: "new-id", slug: "new-slug" }),
);
const mockUpdate = mock<() => Promise<{ id: string; slug: string }>>(() =>
  Promise.resolve({ id: "updated-id", slug: "updated-slug" }),
);
const mockDelete = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "deleted-id" }),
);
const mockAgreementCreateMany = mock<() => Promise<{ count: number }>>(() =>
  Promise.resolve({ count: 0 }),
);
const mockAggregate = mock<
  () => Promise<{ _max: { footerOrder: number | null } }>
>(() => Promise.resolve({ _max: { footerOrder: null } }));

type TxClient = {
  termsDocument: { update: typeof mockUpdate };
};
const mockTransaction = mock<
  (cb: (tx: TxClient) => Promise<unknown>) => Promise<unknown>
>((cb) => cb({ termsDocument: { update: mockUpdate } }));

// $executeRaw tagged template の最後の呼び出しを記録する（reorder 単一 SQL 化の検証用）
const mockExecuteRaw = mock<
  (strings: TemplateStringsArray, ...values: unknown[]) => Promise<number>
>(() => Promise.resolve(0));

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    termsDocument: {
      findFirst: mockFindFirst,
      findUnique: mockFindUnique,
      findMany: mockFindMany,
      create: mockCreate,
      update: mockUpdate,
      delete: mockDelete,
      aggregate: mockAggregate,
    },
    termsAgreement: {
      createMany: mockAgreementCreateMany,
    },
    $transaction: mockTransaction,
    $executeRaw: mockExecuteRaw,
  },
}));

// Prisma.sql / Prisma.join は実行時にトークン化された SQL 片を返す。テストでは
// 結合済み文字列で検証できるよう raw を保持するスタブを返す。
mock.module("@generated/prisma/client", () => {
  type SqlFragment = { __sql: string; __values: unknown[] };
  const sql = (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): SqlFragment => {
    let combined = "";
    for (let i = 0; i < strings.length; i++) {
      combined += strings[i];
      if (i < values.length) {
        const v = values[i] as SqlFragment | unknown;
        if (v && typeof v === "object" && "__sql" in (v as object)) {
          combined += (v as SqlFragment).__sql;
        } else {
          combined += `$${i + 1}`;
        }
      }
    }
    return { __sql: combined, __values: values };
  };
  return {
    Prisma: {
      sql,
      join: (parts: SqlFragment[], separator = ","): SqlFragment => ({
        __sql: parts.map((p) => p.__sql).join(separator),
        __values: parts.flatMap((p) => p.__values),
      }),
      raw: (s: string): SqlFragment => ({ __sql: s, __values: [] }),
      JsonNull: "JsonNull",
    },
  };
});

const {
  createTermsCommand,
  updateTermsCommand,
  reorderTermsCommand,
  softDeleteTermsCommand,
  restoreTermsCommand,
  recordTermsAgreementsCommand,
} = await import("@/shared/domain/terms/commands");

const VALID_INPUT = {
  type: "privacy",
  slug: "privacy-policy",
  title: "プライバシーポリシー",
  contentJson: '{"root":{"type":"root","children":[]}}',
  contentHtml: "<p>テスト規約</p>",
  isPublished: true,
  scopes: ["LOGIN_SIGNUP" as const],
  changelog: null,
  showInFooter: true,
};

describe("createTermsCommand", () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({ id: "id-1", slug: "privacy-policy" });
    mockAggregate.mockReset();
    mockAggregate.mockResolvedValue({ _max: { footerOrder: null } });
  });

  test("footerOrder は末尾に自動採番される（maxOrder + 1）", async () => {
    mockAggregate.mockResolvedValue({ _max: { footerOrder: 6 } });

    await createTermsCommand(VALID_INPUT);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ footerOrder: 7 }),
      }),
    );
  });

  test("公開時は publishedAt が Date インスタンスで設定される", async () => {
    await createTermsCommand(VALID_INPUT);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          publishedAt: expect.any(Date),
          isPublished: true,
        }),
      }),
    );
  });

  test("非公開時は publishedAt が null", async () => {
    await createTermsCommand({ ...VALID_INPUT, isPublished: false });

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          publishedAt: null,
          isPublished: false,
        }),
      }),
    );
  });

  test("slug 重複時は CONFLICT を throw する", async () => {
    mockFindFirst.mockResolvedValueOnce({ id: "existing-id" });

    await expect(createTermsCommand(VALID_INPUT)).rejects.toThrow(
      "このスラッグは既に使用されています",
    );
    expect(mockCreate).not.toHaveBeenCalled();
  });
});

describe("updateTermsCommand", () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
    mockUpdate.mockReset();
    mockUpdate.mockResolvedValue({ id: "id-1", slug: "privacy-policy" });
  });

  test("対象不在は NOT_FOUND を throw する", async () => {
    mockFindFirst.mockResolvedValueOnce(null);

    await expect(updateTermsCommand("missing-id", VALID_INPUT)).rejects.toThrow(
      "規約が見つかりません",
    );
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  test("既に公開済みなら publishedAt を保持する", async () => {
    const originalPublishedAt = new Date("2025-01-15T00:00:00Z");
    mockFindFirst.mockResolvedValueOnce({
      id: "id-1",
      slug: "old-slug",
      isPublished: true,
      publishedAt: originalPublishedAt,
    });

    await updateTermsCommand("id-1", VALID_INPUT);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          publishedAt: originalPublishedAt,
        }),
      }),
    );
  });

  test("previousSlug を戻り値に含める", async () => {
    mockFindFirst.mockResolvedValueOnce({
      id: "id-1",
      slug: "old-slug",
      isPublished: false,
      publishedAt: null,
    });

    const result = await updateTermsCommand("id-1", VALID_INPUT);

    expect(result.previousSlug).toBe("old-slug");
  });

  test("footerOrder は更新しない（位置は reorder のみ）", async () => {
    mockFindFirst.mockResolvedValueOnce({
      id: "id-1",
      slug: "privacy-policy",
      isPublished: false,
      publishedAt: null,
    });

    await updateTermsCommand("id-1", VALID_INPUT);

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.not.objectContaining({
          footerOrder: expect.anything(),
        }),
      }),
    );
  });
});

describe("reorderTermsCommand", () => {
  beforeEach(() => {
    mockUpdate.mockReset();
    mockUpdate.mockResolvedValue({ id: "id-1", slug: "privacy-policy" });
    mockExecuteRaw.mockReset();
    mockExecuteRaw.mockResolvedValue(0);
  });

  test("orderedIds の順に footerOrder を 0 始まりで CASE WHEN 単一 SQL で再採番する", async () => {
    await reorderTermsCommand(["id-a", "id-b", "id-c"]);

    // N 回ループ UPDATE は廃止 — 1 回の $executeRaw に集約される
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockExecuteRaw).toHaveBeenCalledTimes(1);

    const call = mockExecuteRaw.mock.calls[0];
    // 外側 template の静的部分（テーブル名・列名・CASE・WHERE）を検証
    const sql =
      (call?.[0] as TemplateStringsArray | undefined)?.join("?") ?? "";
    expect(sql).toContain("terms_documents");
    expect(sql).toContain("footerOrder");
    expect(sql).toContain("CASE");
    expect(sql).toContain("deletedAt");
  });

  test("空配列の場合 SQL を実行しない", async () => {
    const result = await reorderTermsCommand([]);

    expect(result).toEqual({ updated: 0 });
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });
});

describe("softDeleteTermsCommand / restoreTermsCommand", () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
    mockFindUnique.mockReset();
    mockUpdate.mockReset();
  });

  test("softDelete は deletedAt を set + isPublished を false 化する", async () => {
    mockFindFirst.mockResolvedValueOnce({ id: "id-1", slug: "privacy" });
    mockUpdate.mockResolvedValueOnce({ id: "id-1", slug: "privacy" });

    await softDeleteTermsCommand("id-1");

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "id-1" },
        data: expect.objectContaining({
          deletedAt: expect.any(Date),
          isPublished: false,
        }),
      }),
    );
  });

  test("restore は削除済み以外で VALIDATION を throw する", async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: "id-1",
      slug: "privacy",
      deletedAt: null, // 削除されていない
    });

    await expect(restoreTermsCommand("id-1")).rejects.toThrow(
      "削除済みの規約のみ復元できます",
    );
  });

  test("restore は同 slug の有効レコード存在時 CONFLICT を throw する", async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: "id-1",
      slug: "privacy",
      deletedAt: new Date(),
    });
    // slug 衝突するレコード
    mockFindFirst.mockResolvedValueOnce({ id: "conflicting-id" });

    await expect(restoreTermsCommand("id-1")).rejects.toThrow(
      "同一スラッグの規約が既に存在するため復元できません",
    );
  });
});

describe("recordTermsAgreementsCommand", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockAgreementCreateMany.mockReset();
    mockAgreementCreateMany.mockResolvedValue({ count: 0 });
  });

  test("空配列入力は早期 return ({ count: 0 }) で DB アクセスなし", async () => {
    const result = await recordTermsAgreementsCommand({
      termsIds: [],
      scope: "RESERVATION" as const,
    });

    expect(result).toEqual({ count: 0 });
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(mockAgreementCreateMany).not.toHaveBeenCalled();
  });

  test("公開規約が存在しない場合は count: 0 を返し createMany を呼ばない", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    const result = await recordTermsAgreementsCommand({
      termsIds: ["t1", "t2"],
      scope: "RESERVATION" as const,
    });

    expect(result).toEqual({ count: 0 });
    expect(mockAgreementCreateMany).not.toHaveBeenCalled();
  });

  test("contentSnapshot + sha256 hash + context を含めて createMany を呼ぶ", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: "t1", contentHtml: "<p>第1条</p>" },
    ]);
    mockAgreementCreateMany.mockResolvedValueOnce({ count: 1 });

    const result = await recordTermsAgreementsCommand({
      termsIds: ["t1"],
      scope: "RESERVATION" as const,
      resourceId: "res-1",
      ipAddress: "127.0.0.1",
    });

    expect(result.count).toBe(1);
    expect(mockAgreementCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            termsId: "t1",
            contentSnapshot: "<p>第1条</p>",
            contentHash: expect.stringMatching(/^[a-f0-9]{64}$/),
            scope: "RESERVATION" as const,
            resourceId: "res-1",
            ipAddress: "127.0.0.1",
          }),
        ]),
      }),
    );
  });

  test("null の optional フィールドは createMany payload に含まない", async () => {
    mockFindMany.mockResolvedValueOnce([{ id: "t1", contentHtml: "<p>x</p>" }]);
    mockAgreementCreateMany.mockResolvedValueOnce({ count: 1 });

    await recordTermsAgreementsCommand({
      termsIds: ["t1"],
      scope: "RESERVATION" as const,
      customerId: null,
      guestEmail: null,
    });

    expect(mockAgreementCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.not.objectContaining({ customerId: expect.anything() }),
        ]),
      }),
    );
    expect(mockAgreementCreateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.not.objectContaining({ guestEmail: expect.anything() }),
        ]),
      }),
    );
  });
});
