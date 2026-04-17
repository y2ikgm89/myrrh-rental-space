/**
 * メールテンプレート Server Action 統合テスト
 *
 * src/app/(admin)/admin/(dashboard)/_shared/actions/email-template.ts のテスト
 *
 * モック方針:
 * - executeAdminMutationResult: @/admin/lib/admin-action をモック（認証バイパス）
 * - updateEmailTemplateCommand / toggleEmailTemplateEnabledCommand: domain コマンドをモック
 * - createValidationMutationError: action-helpers をモック
 * - updateTag: next/cache をモック
 * - sendTestEmailForType: test send helper をモック
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { DomainError } from "@/shared/domain/domain-error";

// =============================================================================
// モック設定（import より前に配置）
// =============================================================================

mock.module("@/shared/lib/action-helpers", () => ({
  createValidationMutationError: (error: import("zod").ZodError) => ({
    error: "入力内容に誤りがあります",
    fieldErrors: Object.fromEntries(
      error.issues.map((issue) => [issue.path[0] ?? "_", [issue.message]]),
    ),
  }),
}));

const MOCK_ADMIN_USER = {
  id: "admin-user-001",
  email: "admin@example.com",
  name: "Admin",
  role: "SUPER_ADMIN" as const,
};

mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: mock(
    async (opts: {
      execute: (user: typeof MOCK_ADMIN_USER) => Promise<unknown>;
      afterSuccess?: (data: unknown) => void;
    }) => {
      try {
        const data = await opts.execute(MOCK_ADMIN_USER);
        if (opts.afterSuccess) {
          opts.afterSuccess(data);
        }
        return { data };
      } catch (err) {
        if (err instanceof DomainError) {
          return { error: err.message };
        }
        throw err;
      }
    },
  ),
}));

const mockUpdateEmailTemplateCommand = mock(() =>
  Promise.resolve({ id: "template-001" }),
);
const mockToggleEmailTemplateEnabledCommand = mock(() =>
  Promise.resolve({ id: "template-001" }),
);

mock.module("@/shared/domain/email-templates/commands", () => ({
  updateEmailTemplateCommand: mockUpdateEmailTemplateCommand,
  toggleEmailTemplateEnabledCommand: mockToggleEmailTemplateEnabledCommand,
}));

const mockSendTestEmailForType = mock(() => Promise.resolve());

mock.module(
  "@/app/(admin)/admin/(dashboard)/_shared/actions/email-template-test",
  () => ({
    sendTestEmailForType: mockSendTestEmailForType,
  }),
);

mock.module("next/cache", () => ({
  updateTag: mock(() => undefined),
  revalidateTag: mock(() => undefined),
  cacheTag: mock(() => undefined),
  cacheLife: mock(() => undefined),
}));

// =============================================================================
// Import 対象（モック後に import）
// =============================================================================

const {
  updateEmailTemplate,
  toggleEmailTemplateEnabled,
  sendTestEmail,
} = await import(
  "../../../../src/app/(admin)/admin/(dashboard)/_shared/actions/email-template"
);

// =============================================================================
// Tests
// =============================================================================

describe("updateEmailTemplate", () => {
  beforeEach(() => {
    mockUpdateEmailTemplateCommand.mockClear();
  });

  test("有効な type と入力で成功を返す", async () => {
    const result = await updateEmailTemplate("reservation_confirmation", {
      subject: "新件名",
      greeting: "{{customerName}} 様",
      intro: "新導入文",
      outro: "新締め文",
      enabled: true,
    });
    expect(result).toEqual({ data: { id: "template-001" } });
    expect(mockUpdateEmailTemplateCommand).toHaveBeenCalledTimes(1);
  });

  test("無効な type で error を返す", async () => {
    const result = await updateEmailTemplate("invalid_type", {
      subject: "x",
      greeting: "x",
      intro: "x",
      outro: "x",
      enabled: true,
    });
    expect(result).toEqual({ error: "無効なメールテンプレート種別です" });
    expect(mockUpdateEmailTemplateCommand).not.toHaveBeenCalled();
  });

  test("バリデーションエラー時に fieldErrors を返す", async () => {
    const result = await updateEmailTemplate("reservation_confirmation", {
      subject: "",
      greeting: "",
      intro: "",
      outro: "",
      enabled: true,
    });
    expect(result).toHaveProperty("fieldErrors");
    expect(mockUpdateEmailTemplateCommand).not.toHaveBeenCalled();
  });
});

describe("toggleEmailTemplateEnabled", () => {
  beforeEach(() => {
    mockToggleEmailTemplateEnabledCommand.mockClear();
  });

  test("有効な type で enabled を切り替える", async () => {
    const result = await toggleEmailTemplateEnabled(
      "reservation_confirmation",
      false,
    );
    expect(result).toEqual({ data: { id: "template-001" } });
    expect(mockToggleEmailTemplateEnabledCommand).toHaveBeenCalledWith(
      "reservation_confirmation",
      false,
    );
  });

  test("無効な type で error を返す", async () => {
    const result = await toggleEmailTemplateEnabled("invalid", true);
    expect(result).toEqual({ error: "無効なメールテンプレート種別です" });
    expect(mockToggleEmailTemplateEnabledCommand).not.toHaveBeenCalled();
  });
});

describe("sendTestEmail", () => {
  beforeEach(() => {
    mockSendTestEmailForType.mockClear();
  });

  test("有効な入力でテスト送信を実行する", async () => {
    const result = await sendTestEmail({
      type: "reservation_confirmation",
      subject: "テスト件名",
      greeting: "{{customerName}} 様",
      intro: "テスト導入文",
      outro: "テスト締め文",
    });
    expect(result).toEqual({ data: null });
    expect(mockSendTestEmailForType).toHaveBeenCalledTimes(1);
  });

  test("バリデーションエラー時に fieldErrors を返す", async () => {
    const result = await sendTestEmail({
      type: "reservation_confirmation",
      subject: "",
      greeting: "",
      intro: "",
      outro: "",
    });
    expect(result).toHaveProperty("fieldErrors");
    expect(mockSendTestEmailForType).not.toHaveBeenCalled();
  });
});
