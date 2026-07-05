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
  () => Promise<{ _max: { displayOrder: number | null } }>
>(() => Promise.resolve({ _max: { displayOrder: null } }));

type TxClient = {
  $executeRaw: typeof mockExecuteRaw;
  termsDocument: {
    create: typeof mockCreate;
    update: typeof mockUpdate;
    aggregate: typeof mockAggregate;
  };
};
const mockTransaction = mock<
  (cb: (tx: TxClient) => Promise<unknown>) => Promise<unknown>
>((cb) =>
  cb({
    $executeRaw: mockExecuteRaw,
    termsDocument: {
      create: mockCreate,
      update: mockUpdate,
      aggregate: mockAggregate,
    },
  }),
);

// $executeRaw tagged template の呼び出しを記録する（reorder 二段更新の検証用）
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

type SqlFragment = { __sql: string; __values: unknown[] };

function isSqlFragment(value: unknown): value is SqlFragment {
  return (
    typeof value === "object" &&
    value !== null &&
    "__sql" in value &&
    "__values" in value
  );
}

// Prisma.sql / Prisma.join は実行時にトークン化された SQL 片を返す。テストでは
// 結合済み文字列で検証できるよう raw を保持するスタブを返す。
mock.module("@generated/prisma/client", () => {
  const sql = (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): SqlFragment => {
    let combined = "";
    for (let i = 0; i < strings.length; i++) {
      combined += strings[i];
      if (i < values.length) {
        const v = values[i];
        if (isSqlFragment(v)) {
          combined += v.__sql;
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
    mockAggregate.mockResolvedValue({ _max: { displayOrder: null } });
  });

  test("displayOrder は末尾に自動採番される（maxOrder + 1）", async () => {
    mockAggregate.mockResolvedValue({ _max: { displayOrder: 6 } });

    await createTermsCommand(VALID_INPUT);

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ displayOrder: 7 }),
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

  test("displayOrder は更新しない（位置は reorder のみ）", async () => {
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
          displayOrder: expect.anything(),
        }),
      }),
    );
  });
});

describe("reorderTermsCommand", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockUpdate.mockReset();
    mockUpdate.mockResolvedValue({ id: "id-1", slug: "privacy-policy" });
    mockTransaction.mockReset();
    mockTransaction.mockImplementation((cb) =>
      cb({
        $executeRaw: mockExecuteRaw,
        termsDocument: {
          create: mockCreate,
          update: mockUpdate,
          aggregate: mockAggregate,
        },
      }),
    );
    mockExecuteRaw.mockReset();
    mockExecuteRaw.mockResolvedValue(0);
  });

  test("orderedIds の順に displayOrder を 0 始まりで二段更新する", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: "id-a", contentHtml: "" },
      { id: "id-b", contentHtml: "" },
      { id: "id-c", contentHtml: "" },
    ]);

    await reorderTermsCommand(["id-a", "id-b", "id-c"]);

    // N 回ループ UPDATE は廃止。unique index 下の swap に耐えるため二段更新する。
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockTransaction).toHaveBeenCalledTimes(1);
    expect(mockExecuteRaw).toHaveBeenCalledTimes(3);

    for (const call of mockExecuteRaw.mock.calls.slice(1)) {
      const sql = call[0].join("?");
      expect(sql).toContain("terms_documents");
      expect(sql).toContain("displayOrder");
      expect(sql).toContain("CASE");
      expect(sql).toContain("deletedAt");
    }
  });

  test("存在しない ID を含む場合は SQL 実行前に NOT_FOUND", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: "id-a", contentHtml: "" },
      { id: "id-b", contentHtml: "" },
    ]);

    await expect(reorderTermsCommand(["id-a", "missing-id"])).rejects.toThrow(
      "規約が見つかりません",
    );

    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });

  test("重複 ID は DB アクセス前に拒否する", async () => {
    await expect(reorderTermsCommand(["id-a", "id-a"])).rejects.toThrow(
      "同じIDを複数指定することはできません",
    );

    expect(mockFindMany).not.toHaveBeenCalled();
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });

  test("既存 ID の subset は過不足として拒否する", async () => {
    mockFindMany.mockResolvedValueOnce([
      { id: "id-a", contentHtml: "" },
      { id: "id-b", contentHtml: "" },
      { id: "id-c", contentHtml: "" },
    ]);

    await expect(reorderTermsCommand(["id-a", "id-b"])).rejects.toThrow(
      "規約数が一致しません",
    );

    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });

  test("空配列の場合 SQL を実行しない", async () => {
    const result = await reorderTermsCommand([]);

    expect(result).toEqual({ updated: 0 });
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(mockUpdate).not.toHaveBeenCalled();
    expect(mockExecuteRaw).not.toHaveBeenCalled();
  });
});

describe("softDeleteTermsCommand / restoreTermsCommand", () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
    mockFindUnique.mockReset();
    mockUpdate.mockReset();
    mockAggregate.mockReset();
    mockAggregate.mockResolvedValue({ _max: { displayOrder: null } });
    mockTransaction.mockReset();
    mockTransaction.mockImplementation((cb) =>
      cb({
        $executeRaw: mockExecuteRaw,
        termsDocument: {
          create: mockCreate,
          update: mockUpdate,
          aggregate: mockAggregate,
        },
      }),
    );
    mockExecuteRaw.mockReset();
    mockExecuteRaw.mockResolvedValue(0);
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

  test("restore は有効規約の末尾 displayOrder へ再採番する", async () => {
    mockFindUnique.mockResolvedValueOnce({
      id: "id-1",
      slug: "privacy",
      deletedAt: new Date(),
    });
    mockFindFirst.mockResolvedValueOnce(null);
    mockAggregate.mockResolvedValueOnce({ _max: { displayOrder: 7 } });
    mockUpdate.mockResolvedValueOnce({ id: "id-1", slug: "privacy" });

    await restoreTermsCommand("id-1");

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ displayOrder: 8 }),
      }),
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
