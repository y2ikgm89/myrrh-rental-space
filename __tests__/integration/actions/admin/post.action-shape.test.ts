/**
 * Post Server Action — action shape & schema 統合テスト
 *
 * **scope**: action 関数の input validation / executeAdminMutationResult への
 * options shape (resource / action / resourceId) / domain command への引数伝搬
 * のみを実 import で検証する。`executeAdminMutationResult` は mock しており
 * **auth / RBAC / cache invalidation / 監査ログは検証しない**。
 * end-to-end な auth + RBAC + cache + audit の検証は
 * `_executeAdminMutationResult-rbac.test.ts` を参照。
 *
 * 対象: src/app/(admin)/admin/(dashboard)/_shared/actions/post/mutations.ts
 * schema 単体 test は post.test.ts に残置。
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

// ============================================================================
// Mocks (must be defined before importing target module)
// ============================================================================

mock.module("server-only", () => ({}));

const mockCreatePost = mock<
  (input: unknown) => Promise<{ id: string; slug: string }>
>(() => Promise.resolve({ id: "post-id-1", slug: "post-slug-1" }));
const mockUpdatePostSettings = mock<
  (id: string, input: unknown) => Promise<{ oldSlug: string; slug: string }>
>(() => Promise.resolve({ oldSlug: "old", slug: "new" }));
const mockDeletePost = mock<(id: string) => Promise<{ slug: string }>>(() =>
  Promise.resolve({ slug: "deleted" }),
);
const mockPublishPost = mock<(id: string) => Promise<{ slug: string }>>(() =>
  Promise.resolve({ slug: "published" }),
);
const mockUnpublishPost = mock<(id: string) => Promise<{ slug: string }>>(() =>
  Promise.resolve({ slug: "unpublished" }),
);
const mockArchivePost = mock<(id: string) => Promise<{ slug: string }>>(() =>
  Promise.resolve({ slug: "archived" }),
);
const mockUpdatePostBody = mock<
  (id: string, input: unknown) => Promise<{ oldSlug: string; slug: string }>
>(() => Promise.resolve({ oldSlug: "s", slug: "s" }));

mock.module("@/shared/domain/posts/post-commands", () => ({
  createPost: mockCreatePost,
  updatePostSettings: mockUpdatePostSettings,
  updatePostBody: mockUpdatePostBody,
  deletePost: mockDeletePost,
  publishPost: mockPublishPost,
  unpublishPost: mockUnpublishPost,
  archivePost: mockArchivePost,
}));

// cache helpers (no-op)
mock.module(
  "@/app/(admin)/admin/(dashboard)/_shared/actions/post/cache-helpers",
  () => ({
    invalidatePostCollectionCaches: mock(async () => {}),
    purgePostCaches: mock(async () => {}),
    purgePostArchive: mock(async () => {}),
    invalidatePostCategoryCaches: mock(async () => {}),
    invalidatePostTagCaches: mock(async () => {}),
  }),
);

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
  execute: (user: { id: string; role: string }) => Promise<T>;
  afterSuccess?: (data: T) => void | Promise<void>;
  resolveAuditResourceId?: (data: T) => string | undefined;
};

const mockExecuteAdminMutationResult = mock<
  <T>(opts: ExecuteOpts<T>) => Promise<T | { error: string }>
>(async <T>(opts: ExecuteOpts<T>) => {
  const data = await opts.execute({ id: "admin-user", role: "ADMIN" });
  if (opts.afterSuccess) await opts.afterSuccess(data);
  return data;
});

mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: mockExecuteAdminMutationResult,
}));

// ============================================================================
// Import target after mocks
// ============================================================================

const {
  createPost,
  updatePostSettings,
  deletePost,
  publishPost,
  unpublishPost,
  archivePost,
} =
  await import("@/app/(admin)/admin/(dashboard)/_shared/actions/post/mutations");
const { isMutationError } = await import("@/shared/lib/mutation-result");

// ============================================================================
// Fixtures
// ============================================================================

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

// Lexical EditorState JSON (空段落 1 ブロック・lexicalJsonSchema が通る最小形)
const VALID_LEXICAL_JSON =
  '{"root":{"children":[{"children":[],"direction":null,"format":"","indent":0,"type":"paragraph","version":1,"textFormat":0,"textStyle":""}],"direction":null,"format":"","indent":0,"type":"root","version":1}}';

const VALID_CREATE_INPUT = {
  title: "テスト投稿",
  slug: "test-post",
  excerpt: "抜粋",
  contentJson: VALID_LEXICAL_JSON,
  contentHtml: "<p>本文</p>",
  thumbnailUrl: "https://example.com/thumb.jpg",
  categoryId: VALID_UUID,
  tags: [],
};

// ============================================================================
// Tests
// ============================================================================

describe("createPost (action shape)", () => {
  beforeEach(() => {
    mockExecuteAdminMutationResult.mockClear();
    mockCreatePost.mockClear();
  });

  test("バリデーション失敗時は executeAdminMutationResult を呼ばない", async () => {
    const result = await createPost({
      ...VALID_CREATE_INPUT,
      slug: "Invalid-Slug",
    });

    expect(isMutationError(result)).toBe(true);
    expect(mockExecuteAdminMutationResult).not.toHaveBeenCalled();
  });

  test("正常系: resource=post, action=create で wrapper 呼出し + domain command 実行", async () => {
    mockCreatePost.mockResolvedValueOnce({ id: "new-id", slug: "new-slug" });

    const result = await createPost(VALID_CREATE_INPUT);

    expect(isMutationError(result)).toBe(false);
    expect(mockExecuteAdminMutationResult).toHaveBeenCalledTimes(1);
    expect(mockExecuteAdminMutationResult).toHaveBeenCalledWith(
      expect.objectContaining({ resource: "post", action: "create" }),
    );
    expect(mockCreatePost).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ id: "new-id" });
  });
});

describe("updatePostSettings (action shape)", () => {
  beforeEach(() => {
    mockExecuteAdminMutationResult.mockClear();
    mockUpdatePostSettings.mockClear();
  });

  test("無効な id は validation error", async () => {
    const result = await updatePostSettings("not-a-uuid", {
      title: "t",
      slug: "s",
      excerpt: "e",
      thumbnailUrl: "https://example.com/x.jpg",
      categoryId: VALID_UUID,
      tags: [],
      status: "PUBLISHED",
    });
    expect(isMutationError(result)).toBe(true);
    expect(mockExecuteAdminMutationResult).not.toHaveBeenCalled();
  });

  test("正常系: resource=post, action=update, resourceId=id で wrapper 呼出し", async () => {
    mockUpdatePostSettings.mockResolvedValueOnce({
      oldSlug: "old",
      slug: "new",
    });

    await updatePostSettings(VALID_UUID, {
      title: "t",
      slug: "new-slug",
      excerpt: "e",
      thumbnailUrl: "https://example.com/x.jpg",
      categoryId: VALID_UUID,
      tags: [],
      status: "PUBLISHED",
    });

    expect(mockExecuteAdminMutationResult).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "post",
        action: "update",
        resourceId: VALID_UUID,
      }),
    );
    expect(mockUpdatePostSettings).toHaveBeenCalledTimes(1);
  });
});

describe("deletePost / publishPost / unpublishPost / archivePost (action shape)", () => {
  beforeEach(() => {
    mockExecuteAdminMutationResult.mockClear();
    mockDeletePost.mockClear();
    mockPublishPost.mockClear();
    mockUnpublishPost.mockClear();
    mockArchivePost.mockClear();
  });

  test("deletePost: 無効な id は validation error", async () => {
    const result = await deletePost("xx");
    expect(isMutationError(result)).toBe(true);
    expect(mockExecuteAdminMutationResult).not.toHaveBeenCalled();
  });

  test("deletePost: 正常系で resource=post, action=delete", async () => {
    mockDeletePost.mockResolvedValueOnce({ slug: "deleted" });
    await deletePost(VALID_UUID);
    expect(mockExecuteAdminMutationResult).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "post",
        action: "delete",
        resourceId: VALID_UUID,
      }),
    );
    expect(mockDeletePost).toHaveBeenCalledWith(VALID_UUID);
  });

  test("publishPost: action=publish", async () => {
    mockPublishPost.mockResolvedValueOnce({ slug: "p" });
    await publishPost(VALID_UUID);
    expect(mockExecuteAdminMutationResult).toHaveBeenCalledWith(
      expect.objectContaining({ resource: "post", action: "publish" }),
    );
  });

  test("unpublishPost: action=publish (toggle)", async () => {
    mockUnpublishPost.mockResolvedValueOnce({ slug: "u" });
    await unpublishPost(VALID_UUID);
    expect(mockExecuteAdminMutationResult).toHaveBeenCalledWith(
      expect.objectContaining({ resource: "post", action: "publish" }),
    );
  });

  test("archivePost: action=publish (archive)", async () => {
    mockArchivePost.mockResolvedValueOnce({ slug: "a" });
    await archivePost(VALID_UUID);
    expect(mockExecuteAdminMutationResult).toHaveBeenCalledWith(
      expect.objectContaining({ resource: "post", action: "publish" }),
    );
  });
});
