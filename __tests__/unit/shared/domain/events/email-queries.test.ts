/**
 * event email domain query tests — DB 読み込みが lib/email から移った回帰。
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";
import { RegistrationStatus } from "@/shared/lib/validations/enums/prisma-types";

mock.module("server-only", () => ({}));

type FindFirstArgs = {
  select?: {
    registrations?: {
      where?: {
        status?: {
          in?: RegistrationStatus[];
        };
      };
    };
  };
};

const mockFindFirst = mock<(args: FindFirstArgs) => Promise<null>>(() =>
  Promise.resolve(null),
);

mock.module("@/shared/db/prisma", () => ({
  prisma: { event: { findFirst: mockFindFirst } },
}));

// eslint-disable-next-line import-x/first -- mock.module must precede imports
import { getEventCancelledNotificationPayload } from "@/shared/domain/events/email-queries";

beforeEach(() => {
  mockFindFirst.mockClear();
});

describe("getEventCancelledNotificationPayload", () => {
  test("recipients query は CONFIRMED / WAITLISTED_OFFERED / WAITLISTED を含む", async () => {
    await getEventCancelledNotificationPayload("evt-1");

    const findFirstArgs = mockFindFirst.mock.calls.at(-1)?.[0];
    const statusIn = findFirstArgs?.select?.registrations?.where?.status?.in;
    expect(statusIn).toBeDefined();
    expect(statusIn).toContain(RegistrationStatus.CONFIRMED);
    expect(statusIn).toContain(RegistrationStatus.WAITLISTED_OFFERED);
    expect(statusIn).toContain(RegistrationStatus.WAITLISTED);
    expect(statusIn).not.toContain(RegistrationStatus.CANCELLED);
    expect(statusIn).not.toContain(RegistrationStatus.EXPIRED);
  });
});
