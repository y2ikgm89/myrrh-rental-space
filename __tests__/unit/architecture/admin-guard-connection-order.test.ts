/**
 * 管理ダッシュボード認可ガードは、不安定値を読む前に `connection()` する。
 *
 * ## なぜ
 *
 * `/admin/settings/integrations` で blocking-prerender-current-time が実発生した。
 * page セグメントは layout と別エントリとして prerender され、default export 冒頭の
 * `requireSettingsManagePage()` が `connection()` より先に
 * `verifyAdminSession` → `recordAdminLoginSuccess` の `Date.now()` を評価した。
 * layout の `connection()` は page を守らない。
 *
 * ## 何を見るか
 *
 * `_helpers.ts` の 3 ガードを実行し、モックの呼び出し順が
 * `connection` → `headers` / `verifyAdminSession` であることを記録配列で判定する。
 * 順序を含む不変条件なのでソース正規表現は使わない。
 *
 * ## 直し方
 *
 * ガード先頭の `await connection()` を戻す。page 側に個別追加しない
 * （付け忘れが再発する）。
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { ADMIN_USER } from "../../fixtures/users";

const callLog: string[] = [];

const mockConnection = mock(async () => {
  callLog.push("connection");
});
const mockHeaders = mock(async () => {
  callLog.push("headers");
  return new Headers();
});
const mockVerifyAdminSession = mock(async () => {
  callLog.push("verifyAdminSession");
  return ADMIN_USER;
});

const actualNextServer = await import("next/server");

mock.module("next/server", () => ({
  ...actualNextServer,
  connection: () => mockConnection(),
}));

mock.module("next/headers", () => ({
  headers: () => mockHeaders(),
}));

mock.module("next/navigation", () => ({
  notFound: () => {
    throw new Error("NOT_FOUND");
  },
}));

const actualSession = await import("@/shared/domain/admin-auth/session");

mock.module("@/shared/domain/admin-auth/session", () => ({
  ...actualSession,
  verifyAdminSession: () => mockVerifyAdminSession(),
}));

mock.module("@/shared/domain/user-page-assignments/queries", () => ({
  getAssignedPageIdsForUser: async () => [],
}));

mock.module("@/admin/lib/audit", () => ({
  recordPermissionDenied: () => {},
}));

const { headers } = await import("next/headers");
const { verifyAdminSession } =
  await import("@/shared/domain/admin-auth/session");
const {
  requireAdminDashboardAccess,
  requireAdminPermission,
  requireAdminResourcePermission,
} = await import("@/admin/queries/_helpers");

function connectionPrecedesRequestIo(log: readonly string[]): boolean {
  const connectionAt = log.indexOf("connection");
  if (connectionAt < 0) {
    return false;
  }

  const requestIoAt = ["headers", "verifyAdminSession"]
    .map((name) => log.indexOf(name))
    .filter((index) => index >= 0);
  if (requestIoAt.length === 0) {
    return false;
  }

  return connectionAt < Math.min(...requestIoAt);
}

async function guardWithoutConnection(): Promise<void> {
  await headers();
  await verifyAdminSession();
}

describe("admin guard connection() は request IO より先", () => {
  beforeEach(() => {
    callLog.length = 0;
    mockConnection.mockClear();
    mockHeaders.mockClear();
    mockVerifyAdminSession.mockClear();
  });

  test("fixture: connection() を呼ばないガードは違反と判定される", async () => {
    await guardWithoutConnection();

    expect(mockHeaders).toHaveBeenCalled();
    expect(mockVerifyAdminSession).toHaveBeenCalled();
    expect(connectionPrecedesRequestIo(callLog)).toBe(false);
  });

  test("requireAdminDashboardAccess は connection() を headers / session より先に呼ぶ", async () => {
    await requireAdminDashboardAccess();

    expect(mockConnection).toHaveBeenCalled();
    expect(mockHeaders).toHaveBeenCalled();
    expect(mockVerifyAdminSession).toHaveBeenCalled();
    expect(connectionPrecedesRequestIo(callLog)).toBe(true);
  });

  test("requireAdminPermission は connection() を headers / session より先に呼ぶ", async () => {
    await requireAdminPermission("page", "read");

    expect(mockConnection).toHaveBeenCalled();
    expect(mockHeaders).toHaveBeenCalled();
    expect(mockVerifyAdminSession).toHaveBeenCalled();
    expect(connectionPrecedesRequestIo(callLog)).toBe(true);
  });

  test("requireAdminResourcePermission は connection() を headers / session より先に呼ぶ", async () => {
    await requireAdminResourcePermission("page", "read", "page-1");

    expect(mockConnection).toHaveBeenCalled();
    expect(mockHeaders).toHaveBeenCalled();
    expect(mockVerifyAdminSession).toHaveBeenCalled();
    expect(connectionPrecedesRequestIo(callLog)).toBe(true);
  });
});
