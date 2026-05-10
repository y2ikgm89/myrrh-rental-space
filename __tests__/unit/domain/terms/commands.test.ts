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
    },
    termsAgreement: {
      createMany: mockAgreementCreateMany,
    },
  },
}));

// renderEditorStateToHtmlLazy は Lexical 依存重量級 → mock
mock.module("@/admin/lib/lazy-renderer", () => ({
  renderEditorStateToHtmlLazy: (json: string) =>
    Promise.resolve(`<p>${json}</p>`),
}));

const {
  createTermsCommand,
  updateTermsCommand,
  softDeleteTermsCommand,
  restoreTermsCommand,
  recordTermsAgreementsCommand,
} = await import("@/shared/domain/terms/commands");

const VALID_INPUT = {
  type: "privacy",
  slug: "privacy-policy",
  title: "プライバシーポリシー",
  contentJson: '{"root":{"type":"root","children":[]}}',
  isPublished: true,
  requiredAtReservation: false,
  requiredAtInquiry: false,
  requiredAtSignup: true,
  showInFooter: true,
  footerOrder: 0,
};

describe("createTermsCommand", () => {
  beforeEach(() => {
    mockFindFirst.mockReset();
    mockFindFirst.mockResolvedValue(null);
    mockCreate.mockReset();
    mockCreate.mockResolvedValue({ id: "id-1", slug: "privacy-policy" });
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
      context: "reservation",
    });

    expect(result).toEqual({ count: 0 });
    expect(mockFindMany).not.toHaveBeenCalled();
    expect(mockAgreementCreateMany).not.toHaveBeenCalled();
  });

  test("公開規約が存在しない場合は count: 0 を返し createMany を呼ばない", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    const result = await recordTermsAgreementsCommand({
      termsIds: ["t1", "t2"],
      context: "reservation",
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
      context: "reservation",
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
            context: "reservation",
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
      context: "reservation",
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
