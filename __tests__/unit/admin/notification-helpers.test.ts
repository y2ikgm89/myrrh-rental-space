import { describe, expect, test } from "bun:test";
import { getNotificationResourceHref } from "@/admin/lib/notification-helpers";
import { NOTIFICATION_TYPE } from "@/shared/lib/validations/enums/helpers";

describe("getNotificationResourceHref", () => {
  test("event + resourceId → edit route", () => {
    expect(
      getNotificationResourceHref(
        NOTIFICATION_TYPE.EVENT_REGISTRATION,
        "event",
        "8b232297-fb58-4eba-8001-4c65980f906b",
      ),
    ).toBe("/admin/events/8b232297-fb58-4eba-8001-4c65980f906b/edit");
  });

  test("event without resourceId → null", () => {
    expect(
      getNotificationResourceHref(
        NOTIFICATION_TYPE.EVENT_REGISTRATION,
        "event",
        null,
      ),
    ).toBeNull();
  });

  test("customer risk summary → customers list with flaggedOnly", () => {
    expect(
      getNotificationResourceHref(
        NOTIFICATION_TYPE.CUSTOMER_RISK_FLAGGED,
        null,
        null,
      ),
    ).toBe("/admin/customers?flaggedOnly=true");
  });

  test("security summary → audit logs", () => {
    expect(
      getNotificationResourceHref(
        NOTIFICATION_TYPE.SECURITY_AUDIT_INTEGRITY_FAILED,
        null,
        null,
      ),
    ).toBe("/admin/audit-logs");
  });

  test("FAQ stale → faq list", () => {
    expect(
      getNotificationResourceHref(NOTIFICATION_TYPE.FAQ_STALE, null, null),
    ).toBe("/admin/faq");
  });
});
