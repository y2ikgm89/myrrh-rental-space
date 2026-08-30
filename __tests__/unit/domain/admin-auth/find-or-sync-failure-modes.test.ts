/**
 * `findOrSyncAdminAuthUserByEmail` の失敗時の畳み方を固定する。
 *
 * この関数の try は **設定の読み取りだけ**を守る（operation 名も
 * `checkRoleGroupSync`）。sync 本体まで try に入れて `return await` にすると、
 * DB 障害が `null` に畳まれ、呼び出し元の `getCurrentAdminUser` が
 * `recordAdminLoginFailed(reason: "user_not_authorized")` を書いてしまう。
 * 実際には認可されている利用者なので、監査ログに事実と異なる記録が残り、
 * permission-denied のスパイク通知まで誤って鳴りうる。
 *
 * 型付き lint の `return-await` は「try の中で await していない return」を
 * 指摘するが、その直し方は 2 通りあり、`await` を足すほうを選ぶと上の劣化が起きる。
 * ルールでは表せないので、ここで振る舞いとして固定する。
 */
import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const mockFindUnique = mock();
const mockLogError = mock();
const mockIsConfigured = mock();
const mockSync = mock();

mock.module("@/shared/db/prisma", () => ({
  prisma: { user: { findUnique: mockFindUnique } },
}));

mock.module("@/shared/domain/admin-auth/google-role-sync", () => ({
  isAdminRoleGroupSyncConfigured: mockIsConfigured,
  syncAdminAuthUserFromGoogleGroups: mockSync,
}));

mock.module("@/shared/domain/admin-auth/e2e-identity", () => ({
  isE2EAdminIdentityEmail: () => false,
}));

mock.module("@/shared/lib/env/server", () => ({
  serverEnv: { E2E_RUNTIME: "0", ADMIN_TEST_IAP_EMAIL: undefined },
}));

mock.module("@/shared/lib/errors/server", () => ({
  ErrorCategory: { EXTERNAL_API: "EXTERNAL_API" },
  ErrorSeverity: { HIGH: "HIGH" },
  logError: mockLogError,
  normalizeError: (error: unknown) => error,
}));

const { findOrSyncAdminAuthUserByEmail } =
  await import("@/shared/domain/admin-auth/queries");

const EMAIL = "admin@example.com";

describe("findOrSyncAdminAuthUserByEmail の失敗時の畳み方", () => {
  beforeEach(() => {
    mockFindUnique.mockReset();
    mockLogError.mockReset();
    mockIsConfigured.mockReset();
    mockSync.mockReset();
  });

  test("role group env が部分設定なら HIGH ログを出して null（fail-closed）", async () => {
    mockIsConfigured.mockImplementation(() => {
      throw new Error(
        "Google Workspace role group sync is partially configured",
      );
    });

    expect(await findOrSyncAdminAuthUserByEmail(EMAIL)).toBeNull();
    expect(mockLogError).toHaveBeenCalledTimes(1);
    expect(mockSync).not.toHaveBeenCalled();
    // 設定を読めない時点で DB は引かない。
    expect(mockFindUnique).not.toHaveBeenCalled();
  });

  test("sync 本体の失敗は null に畳まず、そのまま伝播する", async () => {
    mockIsConfigured.mockReturnValue(true);
    const dbOutage = new Error("db unavailable");
    mockSync.mockRejectedValue(dbOutage);

    // `expect(...).rejects` はこの repo でハングした実績があるので try/catch で受ける。
    let caught: unknown;
    try {
      await findOrSyncAdminAuthUserByEmail(EMAIL);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(dbOutage);
    // 「認可されていない」ではないので、ここでログを出して null に畳んではいけない。
    expect(mockLogError).not.toHaveBeenCalled();
  });

  test("sync が未設定なら DB 参照にフォールバックする", async () => {
    mockIsConfigured.mockReturnValue(false);
    mockFindUnique.mockResolvedValue({
      id: "u1",
      email: EMAIL,
      name: "Admin",
      image: null,
      role: "ADMIN",
      emailVerified: true,
      dashboardEnabled: true,
    });

    expect(await findOrSyncAdminAuthUserByEmail(EMAIL)).toMatchObject({
      id: "u1",
      email: EMAIL,
    });
    expect(mockSync).not.toHaveBeenCalled();
  });
});
