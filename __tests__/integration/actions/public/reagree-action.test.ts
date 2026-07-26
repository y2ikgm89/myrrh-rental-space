/**
 * 規約再同意 Server Action 統合テスト
 *
 * src/app/(public)/mypage/terms/reagree/_actions.ts
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { expectSubmissionLike } from "../../../helpers/type-assertions";
import { DomainError } from "@/shared/domain/domain-error";

mock.module("server-only", () => ({}));

mock.module("next/headers", () => ({
  headers: mock(() => Promise.resolve(new Headers())),
}));

mock.module("next/navigation", () => ({
  redirect: mock(() => {
    throw new Error("redirect called");
  }),
}));

mock.module("next/cache", () => ({
  revalidatePath: mock(() => undefined),
}));

const mockVerifyCustomerSession = mock(() =>
  Promise.resolve({
    user: { id: "user-001", email: "member@example.com", name: "Member" },
  }),
);
mock.module("@/shared/lib/customer-auth", () => ({
  verifyCustomerSession: mockVerifyCustomerSession,
}));

const mockEnsureCustomerLinked = mock(() =>
  Promise.resolve({
    customer: {
      id: "customer-001",
      isActive: true,
      email: "member@example.com",
    },
    isNew: false,
  }),
);
mock.module("@/shared/domain/customers/link", () => ({
  ensureCustomerLinked: mockEnsureCustomerLinked,
}));

const mockAssertCustomerActive = mock(() => Promise.resolve(undefined));
mock.module("@/shared/domain/customers/guard", () => ({
  assertCustomerActive: mockAssertCustomerActive,
}));

const mockGetReagreeRequiredTermsForCustomer = mock(() =>
  Promise.resolve([
    {
      id: "00000000-0000-4000-a000-000000000001",
      title: "利用規約",
    },
  ]),
);
mock.module("@/shared/domain/terms/queries", () => ({
  getReagreeRequiredTermsForCustomer: mockGetReagreeRequiredTermsForCustomer,
}));

mock.module("@/shared/domain/terms/commands", () => ({
  recordTermsAgreementsCommand: mock(() => Promise.resolve()),
}));

mock.module("@/shared/lib/rate-limit", () => ({
  getClientIpFromHeaders: mock(() => Promise.resolve("127.0.0.1")),
}));

const VALID_TERMS_ID = "00000000-0000-4000-a000-000000000001";

function inputToFormData(input: {
  agreedTermsIds: string[];
  returnTo?: string | null;
}): FormData {
  const fd = new FormData();
  for (const id of input.agreedTermsIds) {
    fd.append("agreedTermsIds", id);
  }
  if (input.returnTo !== undefined && input.returnTo !== null) {
    fd.append("returnTo", input.returnTo);
  }
  return fd;
}

describe("reagreeAction", () => {
  beforeEach(() => {
    mockVerifyCustomerSession.mockClear();
    mockEnsureCustomerLinked.mockClear();
    mockAssertCustomerActive.mockClear();
    mockGetReagreeRequiredTermsForCustomer.mockClear();

    mockVerifyCustomerSession.mockImplementation(() =>
      Promise.resolve({
        user: { id: "user-001", email: "member@example.com", name: "Member" },
      }),
    );
    mockEnsureCustomerLinked.mockImplementation(() =>
      Promise.resolve({
        customer: {
          id: "customer-001",
          isActive: true,
          email: "member@example.com",
        },
        isNew: false,
      }),
    );
    mockAssertCustomerActive.mockImplementation(() =>
      Promise.resolve(undefined),
    );
    mockGetReagreeRequiredTermsForCustomer.mockImplementation(() =>
      Promise.resolve([
        {
          id: VALID_TERMS_ID,
          title: "利用規約",
        },
      ]),
    );
  });

  test("停止顧客は assertCustomerActive の DomainError を form error に変換する", async () => {
    mockAssertCustomerActive.mockImplementation(() =>
      Promise.reject(
        new DomainError(
          "このアカウントは現在ご利用いただけません。お手数ですがお問い合わせフォームよりご連絡ください。",
          "FORBIDDEN",
        ),
      ),
    );

    const { reagreeAction } =
      await import("@/app/(public)/mypage/terms/reagree/_actions");

    const result = await reagreeAction(
      undefined,
      inputToFormData({ agreedTermsIds: [VALID_TERMS_ID] }),
    );
    expectSubmissionLike(result);

    expect(result.status).toBe("error");
    expect(result.error?.[""]?.[0]).toBe(
      "このアカウントは現在ご利用いただけません。お手数ですがお問い合わせフォームよりご連絡ください。",
    );
  });
});
