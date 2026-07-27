/**
 * Location Server Action — action shape & schema 統合テスト
 *
 * **scope**: action 関数の input validation / executeAdminMutationResult への
 * options shape (resource / action / resourceId) / domain command への引数伝搬
 * のみを実 import で検証する。`executeAdminMutationResult` は mock しており
 * **auth / RBAC / cache invalidation の中身 / 監査ログは検証しない**。
 * end-to-end な auth + RBAC + cache + audit の検証は
 * `_executeAdminMutationResult-rbac.test.ts` を参照。
 *
 * 対象: updateLocationPublished / updateLocationOrder / deleteLocation /
 * createLocationAction / updateLocationAction（conform `useActionState`）
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

mock.module("server-only", () => ({}));

mock.module("@/shared/domain/features/check", () => ({
  isFeatureEnabled: mock(() => Promise.resolve(true)),
  requireFeatureEnabled: mock(() => Promise.resolve()),
  assertAdminFeatureCreateAllowed: mock(() => Promise.resolve()),
  ADMIN_FEATURE_CREATE_FORBIDDEN_MESSAGE:
    "この機能は公開面で無効のため新規作成できません",
}));

const mockCreateLocation = mock<
  (data: unknown) => Promise<{ id: string; slug: string }>
>(() => Promise.resolve({ id: "loc-new", slug: "honkan" }));
const mockUpdateLocation = mock<
  (id: string, data: unknown) => Promise<{ id: string; slug: string }>
>((id) => Promise.resolve({ id, slug: "honkan" }));
const mockUpdatePublished = mock<
  (
    id: string,
    isPublished: boolean,
  ) => Promise<{ id: string; isPublished: boolean }>
>((id, isPublished) => Promise.resolve({ id, isPublished }));
const mockUpdateOrder = mock<
  (items: { id: string; sortOrder: number }[]) => Promise<{ updated: number }>
>((items) => Promise.resolve({ updated: items.length }));
const mockDeleteLocation = mock<(id: string) => Promise<{ id: string }>>((id) =>
  Promise.resolve({ id }),
);

mock.module("@/shared/domain/locations/commands", () => ({
  createLocation: mockCreateLocation,
  updateLocation: mockUpdateLocation,
  deleteLocation: mockDeleteLocation,
  updateLocationOrder: mockUpdateOrder,
  updateLocationPublished: mockUpdatePublished,
}));

const mockSyncLocationToGbpCommand = mock(async () => {});
mock.module("@/shared/domain/locations/gbp-sync-commands", () => ({
  syncLocationToGbpCommand: mockSyncLocationToGbpCommand,
}));

const mockFireAndForget = mock(
  (promise: Promise<unknown>) => void promise.catch(() => undefined),
);
mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: mockFireAndForget,
}));

mock.module("next/cache", () => ({
  updateTag: mock(() => {}),
  revalidateTag: mock(() => {}),
  cacheLife: mock(() => {}),
  cacheTag: mock(() => {}),
}));

// 境界 mock: location.ts は `@/shared/lib/cache/site-wide` の
// `invalidateSiteWideCache` 経由でしかキャッシュ無効化しない
// (page.action-shape.test.ts と同じ境界の切り方)。
const mockInvalidateSiteWideCache = mock(() => {});
mock.module("@/shared/lib/cache/site-wide", () => ({
  invalidateSiteWideCache: mockInvalidateSiteWideCache,
}));

const mockPurgeDetailUrls = mock<
  (paths: readonly string[]) => Promise<{ success: boolean }>
>(async () => ({ success: true }));
mock.module("@/shared/lib/cloudflare", () => ({
  purgeCloudflareDetailUrls: mockPurgeDetailUrls,
}));

const mockFirePurgeAsync = mock(
  async (purge: () => Promise<{ success: boolean }>) => {
    await purge();
  },
);
mock.module("@/shared/lib/cache", () => ({
  firePurgeAsync: mockFirePurgeAsync,
}));

// Next.js redirect は特殊な throw で render を中断する契約
// (google-business-profile.test.ts と同じ mock パターン)。
const mockRedirect = mock<(url: string) => never>((url: string) => {
  const error = Object.assign(new Error("NEXT_REDIRECT"), {
    digest: `NEXT_REDIRECT;replace;${url};307;`,
  });
  throw error;
});
mock.module("next/navigation", () => ({
  redirect: mockRedirect,
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

const {
  updateLocationPublished,
  updateLocationOrder,
  deleteLocation,
  createLocationAction,
  updateLocationAction,
} = await import("@/app/(admin)/admin/(dashboard)/_shared/actions/location");
const { isMutationError } = await import("@/shared/lib/mutation-result");

function buildLocationFormData(
  overrides: Record<string, string> = {},
): FormData {
  const fd = new FormData();
  const defaults: Record<string, string> = {
    name: "本館",
    slug: "honkan",
    address: "東京都渋谷区1-1-1",
    imageUrl: "https://media.example.com/locations/honkan.jpg",
    isActive: "on",
  };
  for (const [key, value] of Object.entries({ ...defaults, ...overrides })) {
    fd.set(key, value);
  }
  return fd;
}

const VALID_UUID = "11111111-1111-4111-8111-111111111111";
const VALID_UUID_B = "22222222-2222-4222-8222-222222222222";

describe("updateLocationPublished (action shape)", () => {
  beforeEach(() => {
    mockExecute.mockClear();
    mockUpdatePublished.mockClear();
  });

  test("無効な id は validation error", async () => {
    const r = await updateLocationPublished("bad", true);
    expect(isMutationError(r)).toBe(true);
  });

  test("正常系: resource=location, action=publish", async () => {
    await updateLocationPublished(VALID_UUID, true);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "location",
        action: "publish",
        resourceId: VALID_UUID,
      }),
    );
    expect(mockUpdatePublished).toHaveBeenCalledWith(VALID_UUID, true);
  });
});

describe("updateLocationOrder (action shape)", () => {
  beforeEach(() => {
    mockExecute.mockClear();
    mockUpdateOrder.mockClear();
  });

  test("重複 id は validation error", async () => {
    const r = await updateLocationOrder([
      { id: VALID_UUID, sortOrder: 0 },
      { id: VALID_UUID, sortOrder: 1 },
    ]);
    expect(isMutationError(r)).toBe(true);
  });

  test("正常系: resource=location, action=update", async () => {
    const items = [
      { id: VALID_UUID, sortOrder: 0 },
      { id: VALID_UUID_B, sortOrder: 1 },
    ];
    const result = await updateLocationOrder(items);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "location",
        action: "update",
      }),
    );
    expect(mockUpdateOrder).toHaveBeenCalledWith(items);
    expect(result).toEqual({ updated: 2 });
  });
});

describe("deleteLocation (action shape)", () => {
  beforeEach(() => {
    mockExecute.mockClear();
    mockDeleteLocation.mockClear();
  });

  test("無効な id は validation error", async () => {
    const r = await deleteLocation("bad");
    expect(isMutationError(r)).toBe(true);
  });

  test("正常系: resource=location, action=delete", async () => {
    await deleteLocation(VALID_UUID);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "location",
        action: "delete",
        resourceId: VALID_UUID,
      }),
    );
    expect(mockDeleteLocation).toHaveBeenCalledWith(VALID_UUID);
  });
});

describe("createLocationAction (conform)", () => {
  beforeEach(() => {
    mockExecute.mockClear();
    mockCreateLocation.mockClear();
    mockRedirect.mockClear();
    mockInvalidateSiteWideCache.mockClear();
    mockFireAndForget.mockClear();
    mockSyncLocationToGbpCommand.mockClear();
    mockPurgeDetailUrls.mockClear();
    mockFirePurgeAsync.mockClear();
    mockCreateLocation.mockResolvedValue({ id: "loc-new", slug: "honkan" });
  });

  test("有効な入力で作成し、詳細ページへ redirect する", async () => {
    let thrown: unknown;
    try {
      await createLocationAction(undefined, buildLocationFormData());
    } catch (error) {
      thrown = error;
    }

    expect(mockCreateLocation).toHaveBeenCalledTimes(1);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({ resource: "location", action: "create" }),
    );
    expect(mockRedirect).toHaveBeenCalledWith("/admin/locations/loc-new");
    expect((thrown as { message?: string } | undefined)?.message).toBe(
      "NEXT_REDIRECT",
    );
  });

  test("成功後にサイト全体キャッシュを無効化し、GBP 同期を fire-and-forget する", async () => {
    try {
      await createLocationAction(undefined, buildLocationFormData());
    } catch {
      // redirect throw は正常系の一部（上のテストで検証済み）
    }

    expect(mockInvalidateSiteWideCache).toHaveBeenCalledTimes(1);
    expect(mockFirePurgeAsync).toHaveBeenCalledTimes(1);
    expect(mockPurgeDetailUrls).toHaveBeenCalledWith(["/access"]);
    expect(mockFireAndForget).toHaveBeenCalledTimes(1);
    expect(mockSyncLocationToGbpCommand).toHaveBeenCalledWith({
      locationId: "loc-new",
    });
  });

  test("必須項目（name）が空のときは validation error を返し、command も redirect も呼ばない", async () => {
    const result = await createLocationAction(
      undefined,
      buildLocationFormData({ name: "" }),
    );

    expect(result.status).toBe("error");
    expect(mockCreateLocation).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  test("スラッグ形式が不正なときは validation error を返す", async () => {
    const result = await createLocationAction(
      undefined,
      buildLocationFormData({ slug: "Invalid Slug!" }),
    );

    expect(result.status).toBe("error");
    expect(mockCreateLocation).not.toHaveBeenCalled();
  });
});

describe("updateLocationAction (conform)", () => {
  beforeEach(() => {
    mockExecute.mockClear();
    mockUpdateLocation.mockClear();
    mockRedirect.mockClear();
    mockInvalidateSiteWideCache.mockClear();
    mockFireAndForget.mockClear();
    mockSyncLocationToGbpCommand.mockClear();
    mockPurgeDetailUrls.mockClear();
    mockFirePurgeAsync.mockClear();
    mockUpdateLocation.mockResolvedValue({ id: VALID_UUID, slug: "honkan" });
  });

  test("有効な入力で更新し、一覧タブへ redirect する", async () => {
    let thrown: unknown;
    try {
      await updateLocationAction(
        VALID_UUID,
        undefined,
        buildLocationFormData(),
      );
    } catch (error) {
      thrown = error;
    }

    expect(mockUpdateLocation).toHaveBeenCalledTimes(1);
    expect(mockUpdateLocation.mock.calls[0]?.[0]).toBe(VALID_UUID);
    expect(mockExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        resource: "location",
        action: "update",
        resourceId: VALID_UUID,
      }),
    );
    expect(mockRedirect).toHaveBeenCalledWith("/admin/spaces?tab=locations");
    expect((thrown as { message?: string } | undefined)?.message).toBe(
      "NEXT_REDIRECT",
    );
  });

  test("成功後にサイト全体キャッシュを無効化し、GBP 同期を fire-and-forget する", async () => {
    try {
      await updateLocationAction(
        VALID_UUID,
        undefined,
        buildLocationFormData(),
      );
    } catch {
      // redirect throw は正常系の一部（上のテストで検証済み）
    }

    expect(mockInvalidateSiteWideCache).toHaveBeenCalledTimes(1);
    expect(mockFirePurgeAsync).toHaveBeenCalledTimes(1);
    expect(mockPurgeDetailUrls).toHaveBeenCalledWith(["/access"]);
    expect(mockFireAndForget).toHaveBeenCalledTimes(1);
    expect(mockSyncLocationToGbpCommand).toHaveBeenCalledWith({
      locationId: VALID_UUID,
    });
  });

  test("不正な場所IDは conform より先に弾かれ、command を呼ばない", async () => {
    const result = await updateLocationAction(
      "bad-id",
      undefined,
      buildLocationFormData(),
    );

    expect(result.status).toBe("error");
    expect(mockUpdateLocation).not.toHaveBeenCalled();
    expect(mockExecute).not.toHaveBeenCalled();
  });

  test("必須項目（address）が空のときは validation error を返し、command も redirect も呼ばない", async () => {
    const result = await updateLocationAction(
      VALID_UUID,
      undefined,
      buildLocationFormData({ address: "" }),
    );

    expect(result.status).toBe("error");
    expect(mockUpdateLocation).not.toHaveBeenCalled();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
