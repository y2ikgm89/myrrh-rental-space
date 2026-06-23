/**
 * Space Server Action 実呼出し統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/space.ts の
 * updateSpacePublished / deleteSpace / duplicateSpace を実 import で呼び出す。
 *
 * conform 系 (createSpaceAction / updateSpaceAction) は spaceFormSchema が
 * Lexical + 多数 enum で複雑なため、後続タスクで分離 test 化。
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

mock.module("server-only", () => ({}));

const mockUpdatePublished = mock<
  (
    id: string,
    isPublished: boolean,
  ) => Promise<{ id: string; slug: string; isPublished: boolean }>
>((id, isPublished) => Promise.resolve({ id, slug: "s", isPublished }));
const mockDeleteSpace = mock<
  (id: string) => Promise<{ id: string; slug: string }>
>((id) => Promise.resolve({ id, slug: "s" }));
const mockDuplicateSpace = mock<
  (id: string) => Promise<{ id: string; slug: string }>
>(() => Promise.resolve({ id: "dup", slug: "dup-slug" }));
const mockCreateSpace = mock(() => Promise.resolve({ id: "x", slug: "y" }));
const mockUpdateSpace = mock(() =>
  Promise.resolve({ id: "x", slug: "y", oldSlug: "y" }),
);

mock.module("@/shared/domain/spaces/commands", () => ({
  createSpaceCommand: mockCreateSpace,
  updateSpaceCommand: mockUpdateSpace,
  deleteSpaceCommand: mockDeleteSpace,
  duplicateSpaceCommand: mockDuplicateSpace,
  updateSpacePublishedCommand: mockUpdatePublished,
}));

mock.module("@/shared/lib/cache", () => ({
  invalidateSiteWideCache: mock(() => {}),
  purgeMarketingHomeTag: mock(() => {}),
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
  execute: (user: { id: string; role: string }) => Promise<T>;
  afterSuccess?: (data: T) => void | Promise<void>;
  resolveAuditResourceId?: (data: T) => string | undefined;
};

const mockExecute = mock<
  <T>(opts: ExecuteOpts<T>) => Promise<T | { error: string }>
>(async <T>(opts: ExecuteOpts<T>) => {
  const data = await opts.execute({ id: "admin", role: "ADMIN" });
  if (opts.afterSuccess) await opts.afterSuccess(data);
  return data;
});

mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: mockExecute,
}));

const { updateSpacePublished, deleteSpace, duplicateSpace } =
  await import("@/app/(admin)/admin/(dashboard)/_shared/actions/space");
const { isMutationError } = await import("@/shared/lib/mutation-result");

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

describe("updateSpacePublished (real)", () => {
  beforeEach(() => {
    mockExecute.mockClear();
    mockUpdatePublished.mockClear();
  });

  test("無効な id は validation error", async () => {
    const r = await updateSpacePublished("bad", true);
    expect(isMutationError(r)).toBe(true);
    expect(mockExecute).not.toHaveBeenCalled();
  });

  test("正常系: resource=space, action=publish", async () => {
    await updateSpacePublished(VALID_UUID, true);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "space",
        action: "publish",
        resourceId: VALID_UUID,
      }),
    );
    expect(mockUpdatePublished).toHaveBeenCalledWith(VALID_UUID, true);
  });
});

describe("deleteSpace (real)", () => {
  beforeEach(() => {
    mockExecute.mockClear();
    mockDeleteSpace.mockClear();
  });

  test("無効な id は validation error", async () => {
    const r = await deleteSpace("bad");
    expect(isMutationError(r)).toBe(true);
  });

  test("正常系: resource=space, action=delete", async () => {
    await deleteSpace(VALID_UUID);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "space",
        action: "delete",
        resourceId: VALID_UUID,
      }),
    );
    expect(mockDeleteSpace).toHaveBeenCalledWith(VALID_UUID);
  });
});

describe("duplicateSpace (real)", () => {
  beforeEach(() => {
    mockExecute.mockClear();
    mockDuplicateSpace.mockClear();
  });

  test("正常系: resource=space, action=create", async () => {
    await duplicateSpace(VALID_UUID);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "space",
        action: "create",
      }),
    );
    expect(mockDuplicateSpace).toHaveBeenCalledWith(VALID_UUID);
  });
});
