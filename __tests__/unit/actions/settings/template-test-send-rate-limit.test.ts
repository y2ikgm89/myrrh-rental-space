/**
 * template-test-send Server Action — 専用 rate limiter (L4) の契約。
 *
 * `sendTemplateTestAction` は `authMutationRateLimiter` (20 req / 15min / IP) を
 * 再利用していた過去実装で、同じ egress IP を共有する Better Auth 顧客
 * サインインの bucket に結合していた（管理者が全 25 テンプレを一括検証すると
 * 15 分間顧客ログインが 429 になる、逆も起きる）。
 *
 * 修正: `templateTestSendRateLimiter` (10 / 15min / user.id) を新設し、
 * user.id で per-admin に独立させた。このテストは次を機械的に固定する:
 *   1. 同一 user.id で 10 回まで通り、11 回目は 429 相当の DomainError。
 *   2. 異なる user.id は独立 bucket を持つ（1 人が使い切っても他は影響なし）。
 *   3. 顧客用 `authMutationRateLimiter` はテスト送信経路で呼ばれない
 *      （IP バケットへの結合が構造的に消えていること）。
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { expectRecord } from "../../../helpers/type-assertions";
import { DomainError } from "@/shared/domain/domain-error";
import { installEmailRenderContextMock } from "../../../support/email-render-context-mock";

installEmailRenderContextMock();

type AdminUserLike = {
  id: string;
  email: string;
  name: string;
  image: string | null;
  role: "SUPER_ADMIN" | "ADMIN" | "EDITOR" | "VIEWER";
  emailVerified: boolean;
};

// executeAdminMutationResult をバイパスして execute callback を直接呼ぶ。
// mock 側で作った user を渡すことで user.id 経由の rate-limit を検証する。
let currentUser: AdminUserLike = {
  id: "admin-default",
  email: "admin-default@example.com",
  name: "Default Admin",
  image: null,
  role: "ADMIN",
  emailVerified: true,
};

mock.module("next/cache", () => ({
  cacheLife: mock(() => undefined),
  cacheTag: mock(() => undefined),
  revalidateTag: mock(() => undefined),
  updateTag: mock(() => undefined),
}));

mock.module("next/headers", () => ({
  headers: mock(() => Promise.resolve(new Headers())),
}));

mock.module("server-only", () => ({}));

mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: async (options: {
    execute: (user: AdminUserLike) => Promise<unknown>;
  }): Promise<unknown> => {
    try {
      return await options.execute(currentUser);
    } catch (error) {
      if (error instanceof DomainError) {
        return { error: error.message, code: error.code };
      }
      throw error;
    }
  },
}));

// senderEmail / SEO / footer / domain-verification / registry の各外部依存は
// 「テスト送信が rate-limit を通過してから実行される」ことを検証したいだけなので、
// テンプレ描画や DB 参照は最小限のスタブに固定する。
mock.module("@/shared/domain/settings/queries/notification", () => ({
  getEmailDeliverySettings: async () => ({
    senderEmail: "noreply@example.com",
    senderName: null,
    replyToEmail: null,
  }),
}));

mock.module("@/shared/domain/settings/queries/site", () => ({
  getSeoSettings: async () => ({ siteName: "Test Site" }),
}));

mock.module("@/shared/lib/email/domain-verification", () => ({
  validateSenderDomain: async () => ({ ok: true as const }),
}));

mock.module("@/shared/lib/email/client", () => ({
  resolveSenderEmailAddress: (input: string | null) =>
    input ?? "noreply@example.com",
  resolveTransportApiKey: (key: string | null | undefined) =>
    key ?? "re_test_key",
  isEmailTransportEnabled: () => true,
  getFromAddress: () => "Test <noreply@example.com>",
}));

mock.module("@/shared/emails/_shared/footer-data", () => ({
  getEmailFooterData: async () => ({}),
}));

const sendTestSpy = mock(async () => ({
  ok: true as const,
  messageId: "msg-fake-1",
}));

mock.module("@/shared/emails/_registry", () => ({
  getTemplate: () => ({
    key: "__infra_check",
    label: "infra check",
    description: "",
    category: "system",
    component: () => null,
    fixture: {},
    renderPreview: () => null,
    sendTest: sendTestSpy,
  }),
}));

// rate-limit は「templateTestSendRateLimiter を実体で使いつつ、
// authMutationRateLimiter は spy に差し替える」構成にする（テスト送信経路で
// IP バケットが呼ばれないことを実行時に確認するため）。
const realRateLimit = await import("@/shared/lib/rate-limit");
const authMutationLimiterCheckSpy = mock(async () => ({
  success: true,
  remaining: 20,
  reset: Date.now() + 900_000,
}));

mock.module("@/shared/lib/rate-limit", () => ({
  ...realRateLimit,
  authMutationRateLimiter: {
    check: authMutationLimiterCheckSpy,
    reset: async () => undefined,
  },
}));

// 動的 import で mock を先に適用させる。
const { sendTemplateTestAction } =
  await import("@/admin/actions/settings/template-test-send");

const RECIPIENT = "test@example.com";
const TEMPLATE_KEY = "__infra_check";

async function runSend(userId: string): Promise<unknown> {
  currentUser = {
    id: userId,
    email: `${userId}@example.com`,
    name: userId,
    image: null,
    role: "ADMIN",
    emailVerified: true,
  };
  return sendTemplateTestAction(TEMPLATE_KEY, RECIPIENT);
}

describe("templateTestSendRateLimiter (L4: 専用バケット、user.id ベース)", () => {
  beforeEach(async () => {
    sendTestSpy.mockClear();
    authMutationLimiterCheckSpy.mockClear();
    // 各テストは独立ユーザー ID を使うので明示 reset は不要だが、
    // 万一同じユーザーが使われた場合の泥沼を防いで残余状態を掃く。
    await realRateLimit.templateTestSendRateLimiter.reset("admin-A");
    await realRateLimit.templateTestSendRateLimiter.reset("admin-B");
    await realRateLimit.templateTestSendRateLimiter.reset(
      "admin-independent-1",
    );
    await realRateLimit.templateTestSendRateLimiter.reset(
      "admin-independent-2",
    );
  });

  test("同一 user.id で 10 回まで通り、11 回目は 429 相当の DomainError を返す", async () => {
    for (let i = 0; i < 10; i += 1) {
      const ok = await runSend("admin-A");
      expectRecord(ok);
      // 正常時は { messageId: string } が返る（executeAdminMutationResult
      // モックが execute の戻り値をそのまま返している）。
      expect(ok["messageId"]).toBe("msg-fake-1");
    }
    expect(sendTestSpy).toHaveBeenCalledTimes(10);

    const rejected = await runSend("admin-A");
    expectRecord(rejected);
    expect(rejected["code"]).toBe("VALIDATION");
    expect(typeof rejected["error"]).toBe("string");
    expect(String(rejected["error"])).toContain("リクエストが多すぎます");
    // 11 回目は sendTest まで到達しないこと（rate-limit で早期 throw）
    expect(sendTestSpy).toHaveBeenCalledTimes(10);
  });

  test("異なる user.id は独立バケットを持つ（片方の枯渇が他方に波及しない）", async () => {
    // admin-independent-1 のバケットを完全に使い切る
    for (let i = 0; i < 10; i += 1) {
      await runSend("admin-independent-1");
    }
    const overflow = await runSend("admin-independent-1");
    expectRecord(overflow);
    expect(overflow["code"]).toBe("VALIDATION");

    // 別 user.id は影響を受けず即座に成功する
    const otherUser = await runSend("admin-independent-2");
    expectRecord(otherUser);
    expect(otherUser["messageId"]).toBe("msg-fake-1");
  });

  test("テスト送信経路で顧客用 authMutationRateLimiter は呼ばれない (IP バケット非結合の保証)", async () => {
    const result = await runSend("admin-B");
    expectRecord(result);
    expect(result["messageId"]).toBe("msg-fake-1");
    expect(authMutationLimiterCheckSpy).not.toHaveBeenCalled();
  });
});
