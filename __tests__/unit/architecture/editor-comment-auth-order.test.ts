/**
 * editor-comment の認可は「認証 → 解決 → 認可」の順で走る。
 *
 * ## なぜ
 *
 * `_shared/lib/admin-action.ts` は実行順序契約を**不変**と宣言し、
 * 「1 を 2 より後に置く → 未認証で DB lookup」と明記している。
 * にもかかわらず editor-comment 系だけが別ラッパーで逆順になっていた（監査 A-57）:
 * `resolveEditorCommentAuthTarget` の Prisma クエリが認証より前に無条件で走り、
 * さらに戻り値が NOT_FOUND か認証エラーかで分かれるため、
 * **認証を通す前に threadId の存在を観測できた**。
 * Server Action はページ path への POST なので proxy の rate limit 対象外でもある。
 *
 * ## 何を見るか
 *
 * `executeEditorCommentMutationResult` と `/admin/api/editor-comments/threads/[id]`
 * の GET を実際に実行し、モックの呼び出し順を記録配列で判定する。
 * 順序を含む不変条件なのでソース正規表現では見ない（静的検査は順序を見られない）。
 *
 * ## 直し方
 *
 * 先に `checkAdminAuth()` を通し、その後で contentRef を解決し、
 * 最後に `authorizeResourceAccess(user, ...)` を呼ぶ。
 * `checkResourceAccess` は認証を内包するので、解決より前に置けない。
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";

import { ADMIN_USER } from "../../fixtures/users";

const callLog: string[] = [];

const mockGetCurrentAdminUser = mock(async () => {
  callLog.push("auth");
  return ADMIN_USER;
});

const mockGetThreadContentRef = mock(async () => {
  callLog.push("resolveThread");
  return { contentType: "page" as const, contentId: "page-1" };
});

const mockGetCommentContentRef = mock(async () => {
  callLog.push("resolveComment");
  return { contentType: "page" as const, contentId: "page-1" };
});

const mockGetThreadDetail = mock(async () => {
  callLog.push("threadDetail");
  return { id: "thread-1" };
});

const actualSession = await import("@/shared/domain/admin-auth/session");

mock.module("@/shared/domain/admin-auth/session", () => ({
  ...actualSession,
  getCurrentAdminUser: () => mockGetCurrentAdminUser(),
  getAdminSession: async () => ({ user: await mockGetCurrentAdminUser() }),
}));

mock.module("@/shared/domain/editor-comments/queries", () => ({
  getEditorCommentThreadContentRef: () => mockGetThreadContentRef(),
  getEditorCommentContentRefFromCommentId: () => mockGetCommentContentRef(),
  getThreadDetailQuery: () => mockGetThreadDetail(),
}));

mock.module("@/shared/domain/user-page-assignments/queries", () => ({
  getAssignedPageIdsForUser: async () => [],
}));

mock.module("@/admin/lib/audit", () => ({
  logUserAction: async () => undefined,
  recordPermissionDenied: () => undefined,
}));

const { executeEditorCommentMutationResult } =
  await import("@/admin/lib/editor-comment-auth");
const { GET } =
  await import("@/app/(admin)/admin/api/editor-comments/threads/[id]/route");

/** 認証が「DB から contentRef を解決する」より前に走ったか。 */
function authPrecedesResolve(log: readonly string[]): boolean {
  const authAt = log.indexOf("auth");
  if (authAt < 0) return false;

  const resolveAt = ["resolveThread", "resolveComment"]
    .map((name) => log.indexOf(name))
    .filter((index) => index >= 0);
  if (resolveAt.length === 0) return false;

  return authAt < Math.min(...resolveAt);
}

const THREAD_ID = "00000000-0000-4000-8000-000000000001";

describe("editor-comment は認証 → 解決 → 認可（A-57）", () => {
  beforeEach(() => {
    callLog.length = 0;
  });

  test("fixture: 解決を先に置く形は違反と判定される", async () => {
    // 落ちるべき形（旧実装の骨格）。
    await mockGetThreadContentRef();
    await mockGetCurrentAdminUser();

    expect(callLog).toEqual(["resolveThread", "auth"]);
    expect(authPrecedesResolve(callLog)).toBe(false);
  });

  test("fixture: 認証を先に置く形は違反にならない", async () => {
    await mockGetCurrentAdminUser();
    await mockGetThreadContentRef();

    expect(authPrecedesResolve(callLog)).toBe(true);
  });

  test("executeEditorCommentMutationResult(thread) は認証を先に呼ぶ", async () => {
    const result = await executeEditorCommentMutationResult({
      action: "update",
      contentRef: { kind: "thread", threadId: THREAD_ID },
      execute: async () => {
        callLog.push("execute");
        return { ok: true };
      },
    });

    expect(result).toEqual({ ok: true });
    expect(callLog).toContain("resolveThread");
    expect(callLog).toContain("execute");
    expect(authPrecedesResolve(callLog)).toBe(true);
  });

  test("executeEditorCommentMutationResult(comment) は認証を先に呼ぶ", async () => {
    await executeEditorCommentMutationResult({
      action: "delete",
      contentRef: { kind: "comment", commentId: THREAD_ID },
      execute: async () => ({ ok: true }),
    });

    expect(callLog).toContain("resolveComment");
    expect(authPrecedesResolve(callLog)).toBe(true);
  });

  test("未認証なら contentRef を解決しない（存在有無が漏れない）", async () => {
    mockGetCurrentAdminUser.mockImplementationOnce(async () => {
      callLog.push("auth");
      return null as unknown as typeof ADMIN_USER;
    });

    const result = await executeEditorCommentMutationResult({
      action: "delete",
      contentRef: { kind: "thread", threadId: THREAD_ID },
      execute: async () => ({ ok: true }),
    });

    expect(result).toEqual({ error: "ログインが必要です" });
    // NOT_FOUND を返さない = threadId の存在が認証前に観測できない。
    expect(callLog).toEqual(["auth"]);
  });

  test("threads/[id] GET も認証を先に呼ぶ", async () => {
    const response = await GET(
      new Request(
        `https://admin.test/admin/api/editor-comments/threads/${THREAD_ID}`,
      ),
      { params: Promise.resolve({ id: THREAD_ID }) },
    );

    expect(response.status).toBe(200);
    expect(callLog).toContain("threadDetail");
    expect(authPrecedesResolve(callLog)).toBe(true);
  });

  test("未認証の GET は threadId を解決しない", async () => {
    mockGetCurrentAdminUser.mockImplementationOnce(async () => {
      callLog.push("auth");
      return null as unknown as typeof ADMIN_USER;
    });

    const response = await GET(
      new Request(
        `https://admin.test/admin/api/editor-comments/threads/${THREAD_ID}`,
      ),
      { params: Promise.resolve({ id: THREAD_ID }) },
    );

    expect(response.status).toBe(401);
    expect(callLog).toEqual(["auth"]);
  });
});
