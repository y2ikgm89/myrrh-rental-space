import { beforeEach, describe, expect, mock, test } from "bun:test";
import { expectRecord } from "../../helpers/type-assertions";

const mockExecuteAdminMutationResult = mock(async () => ({
  error: "settingsのupdate権限がありません",
}));
const mockValidateSenderDomain = mock(async () => ({ ok: true as const }));
const mockUpdateEmailSettingsCommand = mock(async () => undefined);

mock.module("next/cache", () => ({
  updateTag: mock(() => undefined),
  cacheTag: mock(() => undefined),
  cacheLife: mock(() => undefined),
}));

mock.module("@/shared/lib/forms/conform-action", () => ({
  executeConformMutation: async (
    _formData: FormData,
    _schema: unknown,
    callback: (data: {
      senderEmail?: string;
      senderName?: string;
      replyToEmail?: string;
      sendReservationConfirmationEmail: boolean;
      notificationStaffIds: string[];
      notificationEmailAddresses: string[];
    }) => Promise<unknown>,
  ) =>
    callback({
      senderEmail: "noreply@example.com",
      senderName: "",
      replyToEmail: "",
      sendReservationConfirmationEmail: true,
      notificationStaffIds: [],
      notificationEmailAddresses: [],
    }),
}));

mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: (
    ...args: Parameters<typeof mockExecuteAdminMutationResult>
  ) => mockExecuteAdminMutationResult(...args),
}));

mock.module("@/shared/lib/email/domain-verification", () => ({
  validateSenderDomain: (
    ...args: Parameters<typeof mockValidateSenderDomain>
  ) => mockValidateSenderDomain(...args),
}));

mock.module("@/shared/domain/settings/commands", () => ({
  updateEmailSettings: (
    ...args: Parameters<typeof mockUpdateEmailSettingsCommand>
  ) => mockUpdateEmailSettingsCommand(...args),
  updateNotificationSettings: mock(async () => undefined),
}));

const { updateEmailSettings } = await import("@/admin/actions/settings/email");

describe("updateEmailSettings auth order", () => {
  beforeEach(() => {
    mockExecuteAdminMutationResult.mockClear();
    mockValidateSenderDomain.mockClear();
    mockUpdateEmailSettingsCommand.mockClear();
  });

  test("settings:update 認可に失敗した場合は Resend ドメイン検証を実行しない", async () => {
    const result: unknown = await updateEmailSettings(
      undefined,
      new FormData(),
    );
    expectRecord(result);

    expect(result["ok"]).toBe(false);
    expect(result["error"]).toBe("settingsのupdate権限がありません");
    expect(mockExecuteAdminMutationResult).toHaveBeenCalled();
    expect(mockValidateSenderDomain).not.toHaveBeenCalled();
    expect(mockUpdateEmailSettingsCommand).not.toHaveBeenCalled();
  });
});
