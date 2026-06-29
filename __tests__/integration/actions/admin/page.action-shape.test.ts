/**
 * Page Server Action — action shape & schema 統合テスト
 *
 * **scope**: action 関数の input validation / executeAdminMutationResult への
 * options shape (resource / action / resourceId) / domain command への引数伝搬
 * のみを実 import で検証する。`executeAdminMutationResult` は mock しており
 * **auth / RBAC / cache invalidation / 監査ログは検証しない**。
 * end-to-end な auth + RBAC + cache + audit の検証は
 * `_executeAdminMutationResult-rbac.test.ts` を参照。
 *
 * 対象: deletePage / deletePagePermanently / restorePage / updatePagePublished /
 * bulkUpdatePagePublished / bulkDeletePages
 *
 * conform 系 (createPage / updatePageSeo) は後続タスクで分離。
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

mock.module("server-only", () => ({}));

const mockDeletePage = mock(async () => {});
const mockDeletePagePermanently = mock(async () => {});
const mockRestorePage = mock(async () => {});
const mockUpdatePublished = mock<
  (slug: string, isPublished: boolean) => Promise<{ isPublished: boolean }>
>((_s, isPublished) => Promise.resolve({ isPublished }));
const mockBulkUpdatePublished = mock(async () => {});
const mockBulkDelete = mock<
  (slugs: string[]) => Promise<{ deletedSlugs: string[] }>
>((slugs) => Promise.resolve({ deletedSlugs: slugs }));
const mockGetPageId = mock<(slug: string) => Promise<string>>(() =>
  Promise.resolve("page-id-1"),
);

mock.module("@/shared/domain/pages/commands", () => ({
  createPageCommand: mock(async () => ({ slug: "x" })),
  deletePageCommand: mockDeletePage,
  deletePagePermanentlyCommand: mockDeletePagePermanently,
  restorePageCommand: mockRestorePage,
  updatePagePublishedCommand: mockUpdatePublished,
  updatePageSeoCommand: mock(async () => {}),
  bulkDeletePagesCommand: mockBulkDelete,
  bulkUpdatePagePublishedCommand: mockBulkUpdatePublished,
}));

mock.module("@/shared/domain/pages/admin-queries", () => ({
  getPageIdBySlugQuery: mockGetPageId,
}));

mock.module("@/shared/lib/cache", () => ({
  firePurgeAsync: mock(() => {}),
}));

mock.module("@/shared/lib/cloudflare", () => ({
  purgeCloudflareDetailUrls: mock(async () => ({ success: true })),
  purgeCloudflareCache: mock(async () => ({ success: true })),
  purgeAllCloudflareCache: mock(async () => ({ success: true })),
  purgeCloudflareByPaths: mock(async () => ({ success: true })),
  purgeCloudflareCacheByTags: mock(async () => ({ success: true })),
  callPurgeApiPublic: mock(async () => ({ success: true })),
  getCloudflareCredentialsValidated: mock(() => null),
  setCloudflareTagPurgeEnabled: mock(() => {}),
  isCloudflareTagPurgeEnabled: mock(() => true),
}));

mock.module("next/cache", () => ({
  updateTag: mock(() => {}),
  revalidateTag: mock(() => {}),
  cacheLife: mock(() => {}),
  cacheTag: mock(() => {}),
}));

type ExecuteOpts<T> = {
  resource: string;
  action: string;
  resourceId?: string;
  checkResourceAccess?: boolean;
  resolveResourceId?: () => Promise<string>;
  resolveAuditResourceId?: (data: T) => string | undefined;
  execute: (user: { id: string; role: string }) => Promise<T>;
  afterSuccess?: (data: T) => void | Promise<void>;
};

const mockExecute = mock<
  <T>(opts: ExecuteOpts<T>) => Promise<T | { error: string }>
>(async <T>(opts: ExecuteOpts<T>) => {
  if (opts.resolveResourceId) {
    await opts.resolveResourceId();
  }
  const data = await opts.execute({ id: "admin", role: "ADMIN" });
  if (opts.afterSuccess) await opts.afterSuccess(data);
  return data;
});

mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: mockExecute,
}));

const {
  deletePage,
  deletePagePermanently,
  restorePage,
  updatePagePublished,
  bulkUpdatePagePublished,
  bulkDeletePages,
} = await import("@/app/(admin)/admin/(dashboard)/_shared/actions/pages");

const SLUG = "about";
const SLUG_B = "contact";

describe("deletePage (action shape)", () => {
  beforeEach(() => {
    mockExecute.mockClear();
    mockDeletePage.mockClear();
  });

  test("正常系: resource=page, action=delete, resourceId=slug", async () => {
    await deletePage(SLUG);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "page",
        action: "delete",
        resourceId: SLUG,
      }),
    );
    expect(mockDeletePage).toHaveBeenCalledWith(SLUG);
  });
});

describe("deletePagePermanently (action shape)", () => {
  beforeEach(() => {
    mockExecute.mockClear();
    mockDeletePagePermanently.mockClear();
  });

  test("正常系: resource=page, action=delete", async () => {
    await deletePagePermanently(SLUG);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "page",
        action: "delete",
        resourceId: SLUG,
      }),
    );
    expect(mockDeletePagePermanently).toHaveBeenCalledWith(SLUG);
  });
});

describe("restorePage (action shape)", () => {
  beforeEach(() => {
    mockExecute.mockClear();
    mockRestorePage.mockClear();
    mockGetPageId.mockClear();
  });

  test("正常系: resource=page, action=update + resolveResourceId 経由", async () => {
    await restorePage(SLUG);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "page",
        action: "update",
        checkResourceAccess: true,
      }),
    );
    expect(mockGetPageId).toHaveBeenCalledWith(SLUG);
    expect(mockRestorePage).toHaveBeenCalledWith(SLUG);
  });
});

describe("updatePagePublished (action shape)", () => {
  beforeEach(() => {
    mockExecute.mockClear();
    mockUpdatePublished.mockClear();
  });

  test("正常系: resource=page, action=publish", async () => {
    const r = await updatePagePublished(SLUG, true);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "page",
        action: "publish",
        resourceId: SLUG,
      }),
    );
    expect(mockUpdatePublished).toHaveBeenCalledWith(SLUG, true);
    expect(r).toEqual({ isPublished: true });
  });
});

describe("bulkUpdatePagePublished (action shape)", () => {
  beforeEach(() => {
    mockExecute.mockClear();
    mockBulkUpdatePublished.mockClear();
  });

  test("正常系: resource=page, action=publish (bulk)", async () => {
    const r = await bulkUpdatePagePublished([SLUG, SLUG_B], false);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "page",
        action: "publish",
      }),
    );
    expect(mockBulkUpdatePublished).toHaveBeenCalledWith([SLUG, SLUG_B], false);
    expect(r).toEqual({ count: 2, isPublished: false });
  });
});

describe("bulkDeletePages (action shape)", () => {
  beforeEach(() => {
    mockExecute.mockClear();
    mockBulkDelete.mockClear();
  });

  test("正常系: resource=page, action=delete (bulk)", async () => {
    const r = await bulkDeletePages([SLUG, SLUG_B]);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "page",
        action: "delete",
      }),
    );
    expect(mockBulkDelete).toHaveBeenCalledWith([SLUG, SLUG_B]);
    expect(r).toEqual({
      deletedCount: 2,
      deletedSlugs: [SLUG, SLUG_B],
    });
  });
});
