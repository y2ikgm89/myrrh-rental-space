/**
 * 予約 / イベント claim Server Action 統合テスト
 *
 * assertLoginSignupReagreed gate の defense-in-depth を検証する。
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { expectErrorResult } from "../../../helpers/type-assertions";
import { DomainError } from "@/shared/domain/domain-error";

mock.module("server-only", () => ({}));

const mockCheckActionRateLimit = mock(() =>
  Promise.resolve({ success: true as const }),
);
mock.module("@/shared/lib/action-helpers", () => ({
  checkActionRateLimit: mockCheckActionRateLimit,
}));

mock.module("@/shared/lib/rate-limit", () => ({
  formSubmitRateLimiter: {},
}));

const mockGetCustomerSession = mock(() =>
  Promise.resolve({
    user: { id: "user-001", name: "Member", email: "member@example.com" },
  }),
);
mock.module("@/shared/lib/customer-auth", () => ({
  getCustomerSession: mockGetCustomerSession,
}));

const RESERVATION_ID = "00000000-0000-4000-a000-000000000001";
const EVENT_REGISTRATION_ID = "cm60x9k3p0000qzrm8f3a1b2c";

mock.module("next/headers", () => ({
  cookies: mock(() =>
    Promise.resolve({
      get: mock((name: string) => {
        if (name === "reservation-claim-token") {
          return { value: "reservation-token" };
        }
        if (name === "event-registration-claim-token") {
          return { value: "event-registration-token" };
        }
        return undefined;
      }),
    }),
  ),
}));

mock.module("@/shared/lib/reservation-claim-token", () => ({
  verifyReservationClaimToken: mock(() => ({
    valid: true,
    reservationId: RESERVATION_ID,
  })),
}));

mock.module("@/shared/domain/reservations/server-deadline-instant", () => ({
  reservationDeadlineNow: mock(() => new Date()),
}));

mock.module("@/shared/lib/event-registration-claim-token", () => ({
  verifyEventRegistrationClaimToken: mock(() => ({
    valid: true,
    eventRegistrationId: EVENT_REGISTRATION_ID,
  })),
}));

mock.module("@/shared/domain/events/server-deadline-instant", () => ({
  eventDeadlineNow: mock(() => new Date()),
}));

const mockEnsureCustomerLinked = mock(() =>
  Promise.resolve({
    customer: { id: "customer-001", isActive: true },
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

const mockAssertLoginSignupReagreed = mock(() => Promise.resolve(undefined));
mock.module("@/shared/domain/terms/consent-gate", () => ({
  assertLoginSignupReagreed: mockAssertLoginSignupReagreed,
}));

mock.module("@/app/(public)/_shared/actions/consume-signup-terms", () => ({
  consumeSignupTermsAction: mock(() => Promise.resolve()),
}));

const mockClaimReservationForCustomer = mock(() =>
  Promise.resolve({ claimed: true }),
);
mock.module("@/shared/domain/reservations/claim-commands", () => ({
  claimReservationForCustomer: mockClaimReservationForCustomer,
}));

const mockClaimEventRegistrationForCustomer = mock(() =>
  Promise.resolve({ claimed: true }),
);
mock.module("@/shared/domain/events/claim-commands", () => ({
  claimEventRegistrationForCustomer: mockClaimEventRegistrationForCustomer,
}));

mock.module("@/shared/domain/audit-log/commands", () => ({
  createAuditLogRecord: mock(() => Promise.resolve()),
}));

mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: (promise: Promise<unknown>) => {
    void promise.catch(() => {});
  },
}));

describe("claimReservationAction", () => {
  beforeEach(() => {
    mockAssertCustomerActive.mockClear();
    mockAssertLoginSignupReagreed.mockClear();
    mockClaimReservationForCustomer.mockClear();
    mockAssertCustomerActive.mockImplementation(() =>
      Promise.resolve(undefined),
    );
    mockAssertLoginSignupReagreed.mockImplementation(() =>
      Promise.resolve(undefined),
    );
  });

  test("LOGIN_SIGNUP 再同意 pending のとき MutationError を返す", async () => {
    mockAssertLoginSignupReagreed.mockImplementation(() =>
      Promise.reject(
        new DomainError(
          "利用規約が更新されています。マイページで再同意してください: /mypage/terms/reagree",
          "FORBIDDEN",
        ),
      ),
    );

    const { claimReservationAction } =
      await import("@/app/(public)/claim/reservation/_actions/claim");

    const result = await claimReservationAction();

    expectErrorResult(result);
    expect(result.error).toBe(
      "利用規約が更新されています。マイページで再同意してください: /mypage/terms/reagree",
    );
    expect(mockClaimReservationForCustomer).not.toHaveBeenCalled();
  });
});

describe("claimEventRegistrationAction", () => {
  beforeEach(() => {
    mockAssertCustomerActive.mockClear();
    mockAssertLoginSignupReagreed.mockClear();
    mockClaimEventRegistrationForCustomer.mockClear();
    mockAssertCustomerActive.mockImplementation(() =>
      Promise.resolve(undefined),
    );
    mockAssertLoginSignupReagreed.mockImplementation(() =>
      Promise.resolve(undefined),
    );
  });

  test("LOGIN_SIGNUP 再同意 pending のとき MutationError を返す", async () => {
    mockAssertLoginSignupReagreed.mockImplementation(() =>
      Promise.reject(
        new DomainError(
          "利用規約が更新されています。マイページで再同意してください: /mypage/terms/reagree",
          "FORBIDDEN",
        ),
      ),
    );

    const { claimEventRegistrationAction } =
      await import("@/app/(public)/claim/event-registration/_actions/claim");

    const result = await claimEventRegistrationAction();

    expectErrorResult(result);
    expect(result.error).toBe(
      "利用規約が更新されています。マイページで再同意してください: /mypage/terms/reagree",
    );
    expect(mockClaimEventRegistrationForCustomer).not.toHaveBeenCalled();
  });
});
