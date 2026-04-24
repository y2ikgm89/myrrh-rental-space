import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockPageFindUnique = mock<() => Promise<{ id: string } | null>>(() =>
  Promise.resolve({ id: "page-1" }),
);

const mockPageUpdate = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "page-1" }),
);

const mockPageFreeformStateFindUnique = mock<
  () => Promise<{
    draftVersion?: number;
    publishedVersion?: number | null;
  } | null>
>(() =>
  Promise.resolve({
    draftVersion: 3,
    publishedVersion: 1,
  }),
);

const mockPageFreeformStateUpdate = mock<
  () => Promise<{ draftVersion: number; updatedAt: Date }>
>(() =>
  Promise.resolve({
    draftVersion: 4,
    updatedAt: new Date("2026-04-23T12:00:00Z"),
  }),
);

const mockPageFreeformRevisionCreate = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "revision-1" }),
);

const mockTransactionPageUpdate = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "page-1" }),
);

const mockTransactionPageFreeformStateFindUnique = mock<
  () => Promise<{
    draftVersion?: number;
    publishedVersion?: number | null;
  } | null>
>(() =>
  Promise.resolve({
    draftVersion: 3,
    publishedVersion: 1,
  }),
);

const mockTransactionPageFreeformStateUpdate = mock<
  () => Promise<{ draftVersion: number; updatedAt: Date }>
>(() =>
  Promise.resolve({
    draftVersion: 4,
    updatedAt: new Date("2026-04-23T12:00:00Z"),
  }),
);

const mockTransactionPageFreeformRevisionFindFirst = mock<
  () => Promise<{
    id: string;
    version: number;
    kind: string;
    createdAt: Date;
    document: unknown;
  } | null>
>(() =>
  Promise.resolve({
    id: "revision-source",
    version: 2,
    kind: "published",
    createdAt: new Date("2026-04-23T10:00:00Z"),
    document: null,
  }),
);

const mockTransactionPageFreeformRevisionCreate = mock<
  () => Promise<{ id: string }>
>(() => Promise.resolve({ id: "revision-1" }));

const mockTx = {
  page: {
    update: mockTransactionPageUpdate,
  },
  pageFreeformState: {
    findUnique: mockTransactionPageFreeformStateFindUnique,
    update: mockTransactionPageFreeformStateUpdate,
  },
  pageFreeformRevision: {
    findFirst: mockTransactionPageFreeformRevisionFindFirst,
    create: mockTransactionPageFreeformRevisionCreate,
  },
};

const mockTransaction = mock<
  <T>(callback: (tx: typeof mockTx) => Promise<T>) => Promise<T>
>((callback) => callback(mockTx));

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    page: {
      findUnique: mockPageFindUnique,
      update: mockPageUpdate,
    },
    pageFreeformState: {
      findUnique: mockPageFreeformStateFindUnique,
      update: mockPageFreeformStateUpdate,
    },
    pageFreeformRevision: {
      create: mockPageFreeformRevisionCreate,
    },
    $transaction: mockTransaction,
  },
}));

import { DomainError } from "@/shared/domain/domain-error";
import {
  publishPageBuilderCommand,
  restorePageBuilderRevisionCommand,
  savePageBuilderDraftCommand,
  unpublishPageBuilderCommand,
} from "@/shared/domain/page-builder/commands";
import { createDefaultPageBuilderDocument } from "@/shared/lib/page-builder/default-document";

const DOCUMENT = createDefaultPageBuilderDocument("テストページ");

describe("savePageBuilderDraftCommand", () => {
  beforeEach(() => {
    mockTransaction.mockClear();
    mockTransactionPageFreeformStateFindUnique.mockReset();
    mockTransactionPageFreeformStateUpdate.mockReset();
    mockTransactionPageFreeformRevisionFindFirst.mockReset();
    mockTransactionPageFreeformRevisionCreate.mockReset();

    mockTransactionPageFreeformStateFindUnique.mockResolvedValue({
      draftVersion: 3,
      publishedVersion: 1,
    });
    mockTransactionPageFreeformStateUpdate.mockResolvedValue({
      draftVersion: 4,
      updatedAt: new Date("2026-04-23T12:00:00Z"),
    });
    mockTransactionPageFreeformRevisionFindFirst.mockResolvedValue({
      id: "revision-source",
      version: 2,
      kind: "published",
      createdAt: new Date("2026-04-23T10:00:00Z"),
      document: DOCUMENT,
    });
    mockTransactionPageFreeformRevisionCreate.mockResolvedValue({
      id: "revision-1",
    });
  });

  test("draft version を更新し revision を作成する", async () => {
    const result = await savePageBuilderDraftCommand(
      "page-1",
      DOCUMENT,
      3,
      "user-1",
    );

    expect(result.draftVersion).toBe(4);
    expect(mockTransactionPageFreeformStateUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { pageId: "page-1" },
        data: expect.objectContaining({
          draftVersion: 4,
        }),
      }),
    );
    expect(mockTransactionPageFreeformRevisionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pageId: "page-1",
          version: 4,
          kind: "draft",
          createdById: "user-1",
        }),
      }),
    );
  });

  test("state がない場合は NOT_FOUND を返す", async () => {
    mockTransactionPageFreeformStateFindUnique.mockResolvedValue(null);

    await expect(
      savePageBuilderDraftCommand("page-1", DOCUMENT, 3),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "ページビルダーの状態が見つかりません",
    });
  });

  test("expected draft version が古い場合は CONFLICT を返す", async () => {
    await expect(
      savePageBuilderDraftCommand("page-1", DOCUMENT, 2),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message:
        "この下書きは別のタブまたは別の編集セッションで更新されました。最新の状態を読み込んでください。",
    });
    expect(mockTransactionPageFreeformStateUpdate).not.toHaveBeenCalled();
    expect(mockTransactionPageFreeformRevisionCreate).not.toHaveBeenCalled();
  });
});

describe("restorePageBuilderRevisionCommand", () => {
  beforeEach(() => {
    mockTransaction.mockClear();
    mockTransactionPageFreeformStateFindUnique.mockReset();
    mockTransactionPageFreeformStateUpdate.mockReset();
    mockTransactionPageFreeformRevisionFindFirst.mockReset();
    mockTransactionPageFreeformRevisionCreate.mockReset();

    mockTransactionPageFreeformStateFindUnique.mockResolvedValue({
      draftVersion: 3,
      publishedVersion: 1,
    });
    mockTransactionPageFreeformStateUpdate.mockResolvedValue({
      draftVersion: 4,
      updatedAt: new Date("2026-04-23T12:00:00Z"),
    });
    mockTransactionPageFreeformRevisionFindFirst.mockResolvedValue({
      id: "revision-source",
      version: 2,
      kind: "published",
      createdAt: new Date("2026-04-23T10:00:00Z"),
      document: DOCUMENT,
    });
    mockTransactionPageFreeformRevisionCreate.mockResolvedValue({
      id: "revision-restore",
    });
  });

  test("指定 revision を draft として復元し新しい revision を作成する", async () => {
    const result = await restorePageBuilderRevisionCommand(
      "page-1",
      "revision-source",
      3,
      "user-1",
    );

    expect(result.draftVersion).toBe(4);
    expect(result.document).toEqual(DOCUMENT);
    expect(result.restoredFrom).toMatchObject({
      id: "revision-source",
      version: 2,
      kind: "published",
    });
    expect(mockTransactionPageFreeformStateUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { pageId: "page-1" },
        data: expect.objectContaining({
          draftVersion: 4,
        }),
      }),
    );
    expect(mockTransactionPageFreeformRevisionCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          pageId: "page-1",
          version: 4,
          kind: "draft",
          createdById: "user-1",
        }),
      }),
    );
  });

  test("対象 revision がない場合は NOT_FOUND を返す", async () => {
    mockTransactionPageFreeformRevisionFindFirst.mockResolvedValue(null);

    await expect(
      restorePageBuilderRevisionCommand("page-1", "missing-revision", 3),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "復元対象の revision が見つかりません",
    });
  });

  test("expected draft version が古い場合は CONFLICT を返す", async () => {
    await expect(
      restorePageBuilderRevisionCommand("page-1", "revision-source", 2),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message:
        "この下書きは別のタブまたは別の編集セッションで更新されました。最新の状態を読み込んでください。",
    });
    expect(mockTransactionPageFreeformStateUpdate).not.toHaveBeenCalled();
    expect(mockTransactionPageFreeformRevisionCreate).not.toHaveBeenCalled();
  });
});

describe("publishPageBuilderCommand", () => {
  beforeEach(() => {
    mockTransaction.mockClear();
    mockTransactionPageUpdate.mockReset();
    mockTransactionPageFreeformStateFindUnique.mockReset();
    mockTransactionPageFreeformStateUpdate.mockReset();
    mockTransactionPageFreeformRevisionCreate.mockReset();

    mockTransactionPageUpdate.mockResolvedValue({ id: "page-1" });
    mockTransactionPageFreeformStateFindUnique.mockResolvedValue({
      draftVersion: 3,
      publishedVersion: 1,
    });
    mockTransactionPageFreeformStateUpdate.mockResolvedValue({
      draftVersion: 4,
      updatedAt: new Date("2026-04-23T12:00:00Z"),
    });
    mockTransactionPageFreeformRevisionCreate.mockResolvedValue({
      id: "revision-1",
    });
  });

  test("draft と published を同時に更新してページを公開する", async () => {
    const result = await publishPageBuilderCommand(
      "page-1",
      DOCUMENT,
      3,
      "user-1",
    );

    expect(result.draftVersion).toBe(4);
    expect(result.publishedVersion).toBe(2);
    expect(mockTransactionPageFreeformStateUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { pageId: "page-1" },
        data: expect.objectContaining({
          draftVersion: 4,
          publishedVersion: 2,
          lastPublishedAt: expect.any(Date),
        }),
      }),
    );
    expect(mockTransactionPageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "page-1" },
        data: expect.objectContaining({
          isPublished: true,
          publishedAt: expect.any(Date),
        }),
      }),
    );
    expect(mockTransactionPageFreeformRevisionCreate).toHaveBeenCalledTimes(2);
  });

  test("state がない場合は NOT_FOUND を返す", async () => {
    mockTransactionPageFreeformStateFindUnique.mockResolvedValue(null);

    await expect(
      publishPageBuilderCommand("page-1", DOCUMENT, 3),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "ページビルダーの状態が見つかりません",
    });
  });

  test("expected draft version が古い場合は CONFLICT を返す", async () => {
    await expect(
      publishPageBuilderCommand("page-1", DOCUMENT, 2),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message:
        "この下書きは別のタブまたは別の編集セッションで更新されました。最新の状態を読み込んでください。",
    });
    expect(mockTransactionPageFreeformStateUpdate).not.toHaveBeenCalled();
    expect(mockTransactionPageFreeformRevisionCreate).not.toHaveBeenCalled();
    expect(mockTransactionPageUpdate).not.toHaveBeenCalled();
  });
});

describe("unpublishPageBuilderCommand", () => {
  beforeEach(() => {
    mockPageFindUnique.mockReset();
    mockPageUpdate.mockReset();
    mockPageFindUnique.mockResolvedValue({ id: "page-1" });
    mockPageUpdate.mockResolvedValue({ id: "page-1" });
  });

  test("ページを非公開にする", async () => {
    const result = await unpublishPageBuilderCommand("page-1");

    expect(result).toEqual({ isPublished: false });
    expect(mockPageUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "page-1" },
        data: {
          isPublished: false,
          publishedAt: null,
        },
      }),
    );
  });

  test("ページがない場合は NOT_FOUND エラーを投げる", async () => {
    mockPageFindUnique.mockResolvedValue(null);

    await expect(unpublishPageBuilderCommand("page-1")).rejects.toThrow(
      DomainError,
    );
  });
});
