/**
 * executeAdminMutationResult — auth / RBAC / cache / audit end-to-end 統合テスト
 *
 * **scope**: 個別 action の `*.action-shape.test.ts` 群は
 * `mock.module("@/admin/lib/admin-action")` で executeAdminMutationResult を
 * 全 bypass しており、auth/RBAC/cache invalidation/監査の動作を一切検証しない。
 * 本 spec は executeAdminMutationResult を **mock せず**、代表 action
 * (deleteCoupon) を 1 回だけ実 import で通すことで、ラッパー本体の実行順序契約:
 *
 *   1. checkAdminAuth
 *   2. resolveResourceId (本テストは未指定)
 *   3. hasPermission (RBAC)
 *   4. userHasResourceAccess (本テストは未指定)
 *   5. execute (domain command)
 *   6. afterSuccess (cache invalidation)
 *   7. fireAndForget(logAction) (監査)
 *
 * を end-to-end で検証する。これにより
 *
 *   - role=ADMIN: command 実行 + afterSuccess 発火 + 監査ログ書込
 *   - role=VIEWER (permission denied): command 非実行 + afterSuccess 非発火 +
 *     logPermissionDenied 発火
 *   - 未認証 (checkAdminAuth fail): command 非実行 + afterSuccess 非発火
 *
 * が回帰検出可能となる。代表 action は 1 件のみで十分 — ラッパー本体の挙動は
 * action 種別に依存しないため、横展開は不要。
 */

import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

// ============================================================================
// Boundary mocks: 認証境界 / 副作用境界のみ mock。
// executeAdminMutationResult 本体 / hasPermission / withPurgeBatch は実物を使う。
// ============================================================================

type AuthSuccess = {
  success: true;
  user: { id: string; email: string; role: string };
};
type AuthFailure = { success: false; error: { error: string } };
type AuthResult = AuthSuccess | AuthFailure;

const mockCheckAdminAuth = mock<() => Promise<AuthResult>>(async () => ({
  success: true,
  user: { id: "admin-user-id", email: "admin@example.com", role: "ADMIN" },
}));

const mockLogAction = mock(async () => {});

mock.module("@/admin/lib/action-auth", () => ({
  checkAdminAuth: mockCheckAdminAuth,
  logAction: mockLogAction,
}));

const mockLogPermissionDenied = mock(async () => {});

mock.module("@/admin/lib/audit", () => ({
  logPermissionDenied: mockLogPermissionDenied,
}));

// fireAndForget は production では非同期に await せず投げ捨てる契約だが、
// テストでは 監査ログ Promise を確実に観測するため同期的に解決させる。
mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: (promise: Promise<unknown>) => {
    void promise;
  },
}));

// updateTag は cache invalidation の発火を観測するためのスパイ
const mockUpdateTag = mock<(tag: string) => void>(() => {});

mock.module("next/cache", () => ({
  updateTag: mockUpdateTag,
  revalidateTag: mock(() => {}),
  cacheLife: mock(() => {}),
  cacheTag: mock(() => {}),
}));

// Cloudflare purge は withPurgeBatch の flush 経路をテスト汚染させないために stub。
// 本テストは updateTag のみ使う action を選んでいるため queueTagPurge は呼ばれず、
// 実際は flush されないが、transitive import の named-export 静的解析対策として
// 完全 stub 化する。
mock.module("@/shared/lib/cloudflare", () => ({
  purgeCloudflareCache: mock(async () => ({ success: true })),
  purgeAllCloudflareCache: mock(async () => ({ success: true })),
  purgeCloudflareByPaths: mock(async () => ({ success: true })),
  purgeCloudflareDetailUrls: mock(async () => ({ success: true })),
  purgeCloudflareCacheByTags: mock(async () => ({ success: true })),
  callPurgeApiPublic: mock(async () => ({ success: true })),
  getCloudflareCredentialsValidated: mock(() => null),
}));

// deleteCouponCommand は domain command の発火観測用スパイ。
// 代表 action として createCoupon / updateCoupon / updateCouponActive も同居しているため
// 関連 export も全て stub する (importer の静的解析対策)。
const mockDeleteCouponCommand = mock(async (_id: string) => {});

mock.module("@/shared/domain/coupons/commands", () => ({
  createCoupon: mock(async () => ({ id: "x" })),
  updateCoupon: mock(async () => {}),
  deleteCoupon: mockDeleteCouponCommand,
  updateCouponActive: mock(async () => ({ isActive: true })),
}));

// ============================================================================
// Target import (mocks 後)
// ============================================================================

const { deleteCoupon } =
  await import("@/app/(admin)/admin/(dashboard)/_shared/actions/coupon");
const { isMutationError } = await import("@/shared/lib/mutation-result");

const VALID_UUID = "11111111-1111-4111-8111-111111111111";

describe("executeAdminMutationResult (end-to-end via deleteCoupon)", () => {
  beforeEach(() => {
    mockCheckAdminAuth.mockClear();
    mockLogAction.mockClear();
    mockLogPermissionDenied.mockClear();
    mockUpdateTag.mockClear();
    mockDeleteCouponCommand.mockClear();
  });

  afterEach(() => {
    // 次の test に汚染しないよう default impl に戻す
    mockCheckAdminAuth.mockImplementation(async () => ({
      success: true,
      user: { id: "admin-user-id", email: "admin@example.com", role: "ADMIN" },
    }));
  });

  test("role=ADMIN: auth → RBAC 通過 → command 実行 → cache invalidation → 監査ログ", async () => {
    const result = await deleteCoupon(VALID_UUID);

    expect(isMutationError(result)).toBe(false);

    // 1. 認証チェックが先頭で呼ばれた
    expect(mockCheckAdminAuth).toHaveBeenCalledTimes(1);

    // 5. domain command が valid id で呼ばれた
    expect(mockDeleteCouponCommand).toHaveBeenCalledTimes(1);
    expect(mockDeleteCouponCommand).toHaveBeenCalledWith(VALID_UUID);

    // 6. afterSuccess の cache invalidation (updateTag) が発火
    //    deleteCoupon は CACHE_TAGS.COUPONS と coupons.detail(id) を invalidate する
    expect(mockUpdateTag).toHaveBeenCalled();
    const calledTags = mockUpdateTag.mock.calls.map((c) => c[0]);
    expect(calledTags.some((t) => typeof t === "string" && t.length > 0)).toBe(
      true,
    );

    // 7. 監査ログ (logAction) が発火 — fireAndForget 経由でも引数は届く
    expect(mockLogAction).toHaveBeenCalledTimes(1);
    expect(mockLogAction).toHaveBeenCalledWith(
      "admin-user-id",
      "delete",
      "coupon",
      VALID_UUID,
    );

    // permission denied は発火していない
    expect(mockLogPermissionDenied).not.toHaveBeenCalled();
  });

  test("role=VIEWER: RBAC で拒否 → command 非実行 → cache 非更新 → logPermissionDenied 発火", async () => {
    mockCheckAdminAuth.mockImplementationOnce(async () => ({
      success: true,
      user: {
        id: "viewer-user-id",
        email: "viewer@example.com",
        role: "VIEWER",
      },
    }));

    const result = await deleteCoupon(VALID_UUID);

    // 認証は成功するが RBAC で拒否される
    expect(isMutationError(result)).toBe(true);
    if (isMutationError(result)) {
      expect(result.error).toContain("権限がありません");
    }

    // 認証は呼ばれている
    expect(mockCheckAdminAuth).toHaveBeenCalledTimes(1);

    // domain command / cache invalidation / 監査ログは発火していない
    expect(mockDeleteCouponCommand).not.toHaveBeenCalled();
    expect(mockUpdateTag).not.toHaveBeenCalled();
    expect(mockLogAction).not.toHaveBeenCalled();

    // permission denied が記録されている
    expect(mockLogPermissionDenied).toHaveBeenCalledTimes(1);
    expect(mockLogPermissionDenied).toHaveBeenCalledWith(
      "viewer-user-id",
      "coupon",
      "delete",
      VALID_UUID,
    );
  });

  test("未認証 (checkAdminAuth fail): RBAC 到達せず command 非実行・afterSuccess 非発火", async () => {
    mockCheckAdminAuth.mockImplementationOnce(async () => ({
      success: false,
      error: { error: "ログインが必要です" },
    }));

    const result = await deleteCoupon(VALID_UUID);

    expect(isMutationError(result)).toBe(true);
    if (isMutationError(result)) {
      expect(result.error).toBe("ログインが必要です");
    }

    expect(mockCheckAdminAuth).toHaveBeenCalledTimes(1);

    // 認証失敗時は RBAC まで到達しないため、permission denied も発火しない
    expect(mockLogPermissionDenied).not.toHaveBeenCalled();

    // domain command / cache invalidation / 監査ログは全て非発火
    expect(mockDeleteCouponCommand).not.toHaveBeenCalled();
    expect(mockUpdateTag).not.toHaveBeenCalled();
    expect(mockLogAction).not.toHaveBeenCalled();
  });
});
