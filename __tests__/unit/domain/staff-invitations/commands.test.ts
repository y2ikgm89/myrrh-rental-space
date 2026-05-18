/**
 * staff-invitations/commands ドメインコマンド テスト
 *
 * src/shared/domain/staff-invitations/commands.ts のテスト
 * Prisma・メール送信・Better Auth crypto をモックしてフローを検証する
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

// -----------------------------------------------------------------------
// Prisma モック関数（import より前に定義 — TDZ 回避）
// -----------------------------------------------------------------------
const mockUserFindUnique = mock<() => Promise<{ id: string } | null>>(() =>
  Promise.resolve(null),
);

const mockInvitationFindFirst = mock<() => Promise<{ id: string } | null>>(() =>
  Promise.resolve(null),
);

const mockInvitationFindUnique = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));

const mockInvitationCreate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({
    id: "invitation-1",
    email: "staff@example.com",
    role: "EDITOR",
    name: "テストスタッフ",
    token: "mock-token-hex",
    expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    usedAt: null,
    createdAt: new Date("2024-01-15T12:00:00Z"),
  }),
);

const mockInvitationUpdate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "invitation-1" }),
);

const mockInvitationDelete = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "invitation-1" }),
);

const mockUserCreate = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "user-new-1" }),
);

const mockAccountCreate = mock<() => Promise<Record<string, unknown>>>(() =>
  Promise.resolve({ id: "account-1" }),
);

const mockInvitationUpdateInTx = mock<() => Promise<Record<string, unknown>>>(
  () => Promise.resolve({ id: "invitation-1", usedAt: new Date() }),
);

const mockTransaction = mock<
  (fn: (tx: unknown) => Promise<{ id: string }>) => Promise<{ id: string }>
>((fn) =>
  fn({
    user: { create: mockUserCreate },
    account: { create: mockAccountCreate },
    staffInvitation: { update: mockInvitationUpdateInTx },
  }),
);

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    user: { findUnique: mockUserFindUnique },
    staffInvitation: {
      findFirst: mockInvitationFindFirst,
      findUnique: mockInvitationFindUnique,
      create: mockInvitationCreate,
      update: mockInvitationUpdate,
      delete: mockInvitationDelete,
    },
    $transaction: mockTransaction,
  },
  Prisma: {
    PrismaClientKnownRequestError: class PrismaClientKnownRequestError extends Error {
      code: string;
      constructor(
        message: string,
        opts: { code: string; clientVersion: string },
      ) {
        super(message);
        this.code = opts.code;
      }
    },
  },
}));

// -----------------------------------------------------------------------
// Better Auth crypto モック
// -----------------------------------------------------------------------
mock.module("better-auth/crypto", () => ({
  hashPassword: mock<(password: string) => Promise<string>>(
    (password: string) => Promise.resolve(`hashed:${password}`),
  ),
}));

// -----------------------------------------------------------------------
// メール送信モック
// -----------------------------------------------------------------------
const mockSendStaffInvitationEmail = mock<
  () => Promise<{ success: boolean; error?: string }>
>(() => Promise.resolve({ success: true }));

mock.module("@/shared/lib/email/system-emails", () => ({
  sendStaffInvitationEmail: mockSendStaffInvitationEmail,
}));

// -----------------------------------------------------------------------
// エラーログモック
// -----------------------------------------------------------------------
const mockLogError = mock<() => void>(() => undefined);

mock.module("@/shared/lib/errors/server", () => ({
  logError: mockLogError,
  ErrorCategory: {
    DATABASE: "DATABASE",
    EXTERNAL_API: "EXTERNAL_API",
  },
  ErrorSeverity: {
    HIGH: "HIGH",
    MEDIUM: "MEDIUM",
  },
}));

// -----------------------------------------------------------------------
// getAppUrl モック
// -----------------------------------------------------------------------
mock.module("@/shared/lib/constants", () => ({
  getAppUrl: () => "http://localhost:3000",
}));

mock.module("@/shared/lib/serialize", () => ({
  omitUndefined: <T extends Record<string, unknown>>(obj: T): Partial<T> => {
    const result: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      if (obj[key] !== undefined) {
        result[key] = obj[key];
      }
    }
    return result as Partial<T>;
  },
}));

// -----------------------------------------------------------------------
// テスト対象を import
// -----------------------------------------------------------------------
import {
  sendInvitation,
  setupPassword,
  deleteInvitation,
  resendInvitation,
} from "@/shared/domain/staff-invitations/commands";

// -----------------------------------------------------------------------
// テストフィクスチャ
// -----------------------------------------------------------------------
const INVITATION_ID = "550e8400-e29b-41d4-a716-446655440010";
const USER_ID = "550e8400-e29b-41d4-a716-446655440020";

const FUTURE_DATE = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
const PAST_DATE = new Date(Date.now() - 1000);

const VALID_INVITATION_RECORD = {
  id: INVITATION_ID,
  email: "staff@example.com",
  role: "EDITOR",
  name: "テストスタッフ",
  token: "abc123def456".padEnd(64, "0"),
  expiresAt: FUTURE_DATE,
  usedAt: null,
  createdAt: new Date("2024-01-15T12:00:00Z"),
};

const VALID_CREATE_INPUT = {
  email: "staff@example.com",
  role: "EDITOR" as const,
  name: "テストスタッフ",
};

const SUPER_ADMIN_CREATOR = { id: USER_ID, role: "SUPER_ADMIN" as const };
const ADMIN_CREATOR = { id: USER_ID, role: "ADMIN" as const };

const VALID_SETUP_INPUT = {
  token: "abc123def456".padEnd(64, "0"),
  password: "securepassword123",
  confirmPassword: "securepassword123",
};

// -----------------------------------------------------------------------
// sendInvitation
// -----------------------------------------------------------------------
describe("sendInvitation", () => {
  beforeEach(() => {
    mockUserFindUnique.mockReset();
    mockInvitationFindFirst.mockReset();
    mockInvitationCreate.mockReset();
    mockSendStaffInvitationEmail.mockReset();
    mockInvitationDelete.mockReset();

    mockUserFindUnique.mockImplementation(() => Promise.resolve(null));
    mockInvitationFindFirst.mockImplementation(() => Promise.resolve(null));
    mockInvitationCreate.mockImplementation(() =>
      Promise.resolve(VALID_INVITATION_RECORD),
    );
    mockSendStaffInvitationEmail.mockImplementation(() =>
      Promise.resolve({ success: true }),
    );
    mockInvitationDelete.mockImplementation(() =>
      Promise.resolve({ id: INVITATION_ID }),
    );
  });

  describe("正常系", () => {
    test("有効な入力で招待を作成してメールを送信し InvitationData を返す", async () => {
      const result = await sendInvitation(
        VALID_CREATE_INPUT,
        SUPER_ADMIN_CREATOR,
      );
      expect(result).toMatchObject({
        id: INVITATION_ID,
        email: "staff@example.com",
        role: "EDITOR",
      });
      expect(mockInvitationCreate).toHaveBeenCalledTimes(1);
      expect(mockSendStaffInvitationEmail).toHaveBeenCalledTimes(1);
    });

    test("InvitationData の日付フィールドが ISO 文字列として返される", async () => {
      const result = await sendInvitation(
        VALID_CREATE_INPUT,
        SUPER_ADMIN_CREATOR,
      );
      expect(typeof result.createdAt).toBe("string");
      expect(typeof result.expiresAt).toBe("string");
    });

    test("name が null の場合 name: null が返される", async () => {
      mockInvitationCreate.mockImplementation(() =>
        Promise.resolve({ ...VALID_INVITATION_RECORD, name: null }),
      );
      const result = await sendInvitation(
        { ...VALID_CREATE_INPUT, name: undefined },
        SUPER_ADMIN_CREATOR,
      );
      expect(result.name).toBeNull();
    });

    test("メール送信時に setupUrl が /admin/setup/{token} 形式になる", async () => {
      await sendInvitation(VALID_CREATE_INPUT, SUPER_ADMIN_CREATOR);
      expect(mockSendStaffInvitationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "staff@example.com",
          setupUrl: expect.stringContaining("/admin/setup/"),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("既に同メールのユーザーが存在する場合 CONFLICT エラーをスロー", async () => {
      mockUserFindUnique.mockImplementation(() =>
        Promise.resolve({ id: USER_ID }),
      );
      await expect(
        sendInvitation(VALID_CREATE_INPUT, SUPER_ADMIN_CREATOR),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        message: "このメールアドレスは既に登録されています",
      });
    });

    test("有効な招待が既に存在する場合 CONFLICT エラーをスロー", async () => {
      mockInvitationFindFirst.mockImplementation(() =>
        Promise.resolve({ id: INVITATION_ID }),
      );
      await expect(
        sendInvitation(VALID_CREATE_INPUT, SUPER_ADMIN_CREATOR),
      ).rejects.toMatchObject({
        code: "CONFLICT",
      });
    });

    test("メール送信失敗時は招待レコードを削除して UNEXPECTED エラーをスロー", async () => {
      mockSendStaffInvitationEmail.mockImplementation(() =>
        Promise.resolve({ success: false, error: "SMTP error" }),
      );
      await expect(
        sendInvitation(VALID_CREATE_INPUT, SUPER_ADMIN_CREATOR),
      ).rejects.toMatchObject({ code: "UNEXPECTED" });
      expect(mockInvitationDelete).toHaveBeenCalledTimes(1);
    });

    test("メール送信失敗時に logError が呼ばれる", async () => {
      mockLogError.mockReset();
      mockSendStaffInvitationEmail.mockImplementation(() =>
        Promise.resolve({ success: false, error: "SMTP error" }),
      );
      await expect(
        sendInvitation(VALID_CREATE_INPUT, SUPER_ADMIN_CREATOR),
      ).rejects.toThrow();
      expect(mockLogError).toHaveBeenCalledTimes(1);
    });

    test("ADMIN が ADMIN を招待しようとすると FORBIDDEN エラーをスロー", async () => {
      await expect(
        sendInvitation({ ...VALID_CREATE_INPUT, role: "ADMIN" }, ADMIN_CREATOR),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: "このロールで招待する権限がありません",
      });

      expect(mockInvitationCreate).not.toHaveBeenCalled();
    });

    test("ADMIN が EDITOR / VIEWER を招待するのは正常", async () => {
      for (const role of ["EDITOR", "VIEWER"] as const) {
        mockUserFindUnique.mockImplementation(() => Promise.resolve(null));
        mockInvitationFindFirst.mockImplementation(() => Promise.resolve(null));
        mockInvitationCreate.mockImplementation(() =>
          Promise.resolve({ ...VALID_INVITATION_RECORD, role }),
        );
        mockSendStaffInvitationEmail.mockImplementation(() =>
          Promise.resolve({ success: true }),
        );

        await expect(
          sendInvitation({ ...VALID_CREATE_INPUT, role }, ADMIN_CREATOR),
        ).resolves.toMatchObject({ role });
      }
    });
  });
});

// -----------------------------------------------------------------------
// setupPassword
// -----------------------------------------------------------------------
describe("setupPassword", () => {
  beforeEach(() => {
    mockInvitationFindUnique.mockReset();
    mockTransaction.mockReset();
    mockUserCreate.mockReset();
    mockAccountCreate.mockReset();
    mockInvitationUpdateInTx.mockReset();

    mockInvitationFindUnique.mockImplementation(() =>
      Promise.resolve(VALID_INVITATION_RECORD),
    );
    mockUserCreate.mockImplementation(() =>
      Promise.resolve({ id: "user-new-1" }),
    );
    mockAccountCreate.mockImplementation(() =>
      Promise.resolve({ id: "account-1" }),
    );
    mockInvitationUpdateInTx.mockImplementation(() =>
      Promise.resolve({ id: INVITATION_ID, usedAt: new Date() }),
    );
    mockTransaction.mockImplementation((fn) =>
      fn({
        user: { create: mockUserCreate },
        account: { create: mockAccountCreate },
        staffInvitation: { update: mockInvitationUpdateInTx },
      }),
    );
  });

  describe("正常系", () => {
    test("有効なトークンとパスワードでユーザーを作成して userId を返す", async () => {
      const result = await setupPassword(VALID_SETUP_INPUT);
      expect(result).toMatchObject({ userId: "user-new-1" });
      expect(mockTransaction).toHaveBeenCalledTimes(1);
    });

    test("ユーザー作成時に emailVerified: true が設定される", async () => {
      await setupPassword(VALID_SETUP_INPUT);
      expect(mockUserCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ emailVerified: true }),
        }),
      );
    });

    test("アカウントが credential プロバイダーで作成される", async () => {
      await setupPassword(VALID_SETUP_INPUT);
      expect(mockAccountCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ providerId: "credential" }),
        }),
      );
    });

    test("パスワードがハッシュ化されてアカウントに保存される", async () => {
      await setupPassword(VALID_SETUP_INPUT);
      expect(mockAccountCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            password: `hashed:${VALID_SETUP_INPUT.password}`,
          }),
        }),
      );
    });

    test("name が null のとき email の @ 前を名前として使う", async () => {
      mockInvitationFindUnique.mockImplementation(() =>
        Promise.resolve({
          ...VALID_INVITATION_RECORD,
          name: null,
          email: "johndoe@example.com",
        }),
      );
      await setupPassword(VALID_SETUP_INPUT);
      expect(mockUserCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ name: "johndoe" }),
        }),
      );
    });

    test("招待の usedAt が更新される", async () => {
      await setupPassword(VALID_SETUP_INPUT);
      expect(mockInvitationUpdateInTx).toHaveBeenCalledTimes(1);
      expect(mockInvitationUpdateInTx).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: INVITATION_ID },
          data: expect.objectContaining({ usedAt: expect.any(Date) }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("存在しないトークンで NOT_FOUND エラーをスロー", async () => {
      mockInvitationFindUnique.mockImplementation(() => Promise.resolve(null));
      await expect(setupPassword(VALID_SETUP_INPUT)).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "無効な招待リンクです",
      });
    });

    test("既に使用済みのトークンで CONFLICT エラーをスロー", async () => {
      mockInvitationFindUnique.mockImplementation(() =>
        Promise.resolve({
          ...VALID_INVITATION_RECORD,
          usedAt: new Date("2024-01-10T12:00:00Z"),
        }),
      );
      await expect(setupPassword(VALID_SETUP_INPUT)).rejects.toMatchObject({
        code: "CONFLICT",
        message: "この招待は既に使用されています",
      });
    });

    test("有効期限切れのトークンで CONFLICT エラーをスロー", async () => {
      mockInvitationFindUnique.mockImplementation(() =>
        Promise.resolve({
          ...VALID_INVITATION_RECORD,
          expiresAt: PAST_DATE,
        }),
      );
      await expect(setupPassword(VALID_SETUP_INPUT)).rejects.toMatchObject({
        code: "CONFLICT",
        message: "この招待は有効期限が切れています",
      });
    });
  });
});

// -----------------------------------------------------------------------
// deleteInvitation
// -----------------------------------------------------------------------
describe("deleteInvitation", () => {
  beforeEach(() => {
    mockInvitationFindUnique.mockReset();
    mockInvitationDelete.mockReset();
    mockInvitationFindUnique.mockImplementation(() =>
      Promise.resolve({
        id: INVITATION_ID,
        email: "staff@example.com",
        name: "テストスタッフ",
        usedAt: null,
      }),
    );
    mockInvitationDelete.mockImplementation(() =>
      Promise.resolve({ id: INVITATION_ID }),
    );
  });

  describe("正常系", () => {
    test("未使用の招待を削除できる", async () => {
      await expect(deleteInvitation(INVITATION_ID)).resolves.toBeUndefined();
      expect(mockInvitationDelete).toHaveBeenCalledTimes(1);
      expect(mockInvitationDelete).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: INVITATION_ID } }),
      );
    });
  });

  describe("異常系", () => {
    test("存在しない招待 ID で NOT_FOUND エラーをスロー", async () => {
      mockInvitationFindUnique.mockImplementation(() => Promise.resolve(null));
      await expect(deleteInvitation("nonexistent")).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "招待が見つかりません",
      });
    });

    test("使用済みの招待は削除できず CONFLICT エラーをスロー", async () => {
      mockInvitationFindUnique.mockImplementation(() =>
        Promise.resolve({
          id: INVITATION_ID,
          email: "staff@example.com",
          name: "テストスタッフ",
          usedAt: new Date("2024-01-10T12:00:00Z"),
        }),
      );
      await expect(deleteInvitation(INVITATION_ID)).rejects.toMatchObject({
        code: "CONFLICT",
        message: "使用済みの招待は操作できません",
      });
      expect(mockInvitationDelete).not.toHaveBeenCalled();
    });
  });
});

// -----------------------------------------------------------------------
// resendInvitation
// -----------------------------------------------------------------------
describe("resendInvitation", () => {
  beforeEach(() => {
    mockInvitationFindUnique.mockReset();
    mockInvitationUpdate.mockReset();
    mockSendStaffInvitationEmail.mockReset();

    mockInvitationFindUnique.mockImplementation(() =>
      Promise.resolve({
        id: INVITATION_ID,
        email: "staff@example.com",
        name: "テストスタッフ",
        role: "EDITOR",
        usedAt: null,
      }),
    );
    mockInvitationUpdate.mockImplementation(() =>
      Promise.resolve({ id: INVITATION_ID }),
    );
    mockSendStaffInvitationEmail.mockImplementation(() =>
      Promise.resolve({ success: true }),
    );
  });

  describe("正常系", () => {
    test("未使用の招待に対してトークン再生成とメール再送ができる", async () => {
      await expect(
        resendInvitation(INVITATION_ID, SUPER_ADMIN_CREATOR),
      ).resolves.toBeUndefined();
      expect(mockInvitationUpdate).toHaveBeenCalledTimes(1);
      expect(mockSendStaffInvitationEmail).toHaveBeenCalledTimes(1);
    });

    test("再送時に token と expiresAt が更新される", async () => {
      await resendInvitation(INVITATION_ID, SUPER_ADMIN_CREATOR);
      expect(mockInvitationUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: INVITATION_ID },
          data: expect.objectContaining({
            token: expect.any(String),
            expiresAt: expect.any(Date),
          }),
        }),
      );
    });

    test("メール再送時に setupUrl が /admin/setup/{token} 形式になる", async () => {
      await resendInvitation(INVITATION_ID, SUPER_ADMIN_CREATOR);
      expect(mockSendStaffInvitationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          to: "staff@example.com",
          setupUrl: expect.stringContaining("/admin/setup/"),
        }),
      );
    });

    test("name が null の場合 email が staffName として使われる", async () => {
      mockInvitationFindUnique.mockImplementation(() =>
        Promise.resolve({
          id: INVITATION_ID,
          email: "staff@example.com",
          name: null,
          role: "EDITOR",
          usedAt: null,
        }),
      );
      await resendInvitation(INVITATION_ID, SUPER_ADMIN_CREATOR);
      expect(mockSendStaffInvitationEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          staffName: "staff@example.com",
        }),
      );
    });

    test("ADMIN は EDITOR の招待を再送できる", async () => {
      await expect(
        resendInvitation(INVITATION_ID, ADMIN_CREATOR),
      ).resolves.toBeUndefined();
      expect(mockSendStaffInvitationEmail).toHaveBeenCalledTimes(1);
    });
  });

  describe("異常系", () => {
    test("存在しない招待 ID で NOT_FOUND エラーをスロー", async () => {
      mockInvitationFindUnique.mockImplementation(() => Promise.resolve(null));
      await expect(
        resendInvitation("nonexistent", SUPER_ADMIN_CREATOR),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
      });
    });

    test("使用済みの招待には再送できず CONFLICT エラーをスロー", async () => {
      mockInvitationFindUnique.mockImplementation(() =>
        Promise.resolve({
          id: INVITATION_ID,
          email: "staff@example.com",
          name: "テストスタッフ",
          role: "EDITOR",
          usedAt: new Date("2024-01-10T12:00:00Z"),
        }),
      );
      await expect(
        resendInvitation(INVITATION_ID, SUPER_ADMIN_CREATOR),
      ).rejects.toMatchObject({
        code: "CONFLICT",
      });
      expect(mockSendStaffInvitationEmail).not.toHaveBeenCalled();
    });

    test("ADMIN は ADMIN の招待を再送できない（FORBIDDEN）", async () => {
      mockInvitationFindUnique.mockImplementation(() =>
        Promise.resolve({
          id: INVITATION_ID,
          email: "staff@example.com",
          name: "テストスタッフ",
          role: "ADMIN",
          usedAt: null,
        }),
      );
      await expect(
        resendInvitation(INVITATION_ID, ADMIN_CREATOR),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
        message: "このロールの招待を再送する権限がありません",
      });

      expect(mockInvitationUpdate).not.toHaveBeenCalled();
      expect(mockSendStaffInvitationEmail).not.toHaveBeenCalled();
    });

    test("メール再送失敗時は UNEXPECTED エラーをスロー", async () => {
      mockSendStaffInvitationEmail.mockImplementation(() =>
        Promise.resolve({ success: false, error: "SMTP error" }),
      );
      await expect(
        resendInvitation(INVITATION_ID, SUPER_ADMIN_CREATOR),
      ).rejects.toMatchObject({
        code: "UNEXPECTED",
      });
    });

    test("メール再送失敗時に logError が呼ばれる", async () => {
      mockLogError.mockReset();
      mockSendStaffInvitationEmail.mockImplementation(() =>
        Promise.resolve({ success: false, error: "SMTP error" }),
      );
      await expect(
        resendInvitation(INVITATION_ID, SUPER_ADMIN_CREATOR),
      ).rejects.toThrow();
      expect(mockLogError).toHaveBeenCalledTimes(1);
    });
  });
});

// -----------------------------------------------------------------------
// toInvitationData（内部ヘルパー — sendInvitation 経由で間接テスト）
// -----------------------------------------------------------------------
describe("toInvitationData 変換（sendInvitation 経由）", () => {
  beforeEach(() => {
    mockUserFindUnique.mockReset();
    mockInvitationFindFirst.mockReset();
    mockInvitationCreate.mockReset();
    mockSendStaffInvitationEmail.mockReset();
    mockInvitationDelete.mockReset();

    mockUserFindUnique.mockImplementation(() => Promise.resolve(null));
    mockInvitationFindFirst.mockImplementation(() => Promise.resolve(null));
    mockSendStaffInvitationEmail.mockImplementation(() =>
      Promise.resolve({ success: true }),
    );
    mockInvitationDelete.mockImplementation(() =>
      Promise.resolve({ id: INVITATION_ID }),
    );
  });

  test("expiresAt が ISO 8601 文字列に変換される", async () => {
    mockInvitationCreate.mockImplementation(() =>
      Promise.resolve({ ...VALID_INVITATION_RECORD, expiresAt: FUTURE_DATE }),
    );
    const result = await sendInvitation(
      VALID_CREATE_INPUT,
      SUPER_ADMIN_CREATOR,
    );
    expect(result.expiresAt).toBe(FUTURE_DATE.toISOString());
  });

  test("usedAt が null のとき null を返す", async () => {
    mockInvitationCreate.mockImplementation(() =>
      Promise.resolve({ ...VALID_INVITATION_RECORD, usedAt: null }),
    );
    const result = await sendInvitation(
      VALID_CREATE_INPUT,
      SUPER_ADMIN_CREATOR,
    );
    expect(result.usedAt).toBeNull();
  });

  test("usedAt が Date のとき ISO 8601 文字列に変換される", async () => {
    const usedDate = new Date("2024-01-16T12:00:00Z");
    mockInvitationCreate.mockImplementation(() =>
      Promise.resolve({ ...VALID_INVITATION_RECORD, usedAt: usedDate }),
    );
    const result = await sendInvitation(
      VALID_CREATE_INPUT,
      SUPER_ADMIN_CREATOR,
    );
    expect(result.usedAt).toBe(usedDate.toISOString());
  });

  test("createdAt が ISO 8601 文字列に変換される", async () => {
    const createdDate = new Date("2024-01-15T12:00:00Z");
    mockInvitationCreate.mockImplementation(() =>
      Promise.resolve({ ...VALID_INVITATION_RECORD, createdAt: createdDate }),
    );
    const result = await sendInvitation(
      VALID_CREATE_INPUT,
      SUPER_ADMIN_CREATOR,
    );
    expect(result.createdAt).toBe(createdDate.toISOString());
  });
});
