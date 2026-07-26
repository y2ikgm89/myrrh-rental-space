import { describe, expect, test } from "bun:test";
import { checkGuestStatusMemberOwnership } from "@/shared/lib/guest-status-member-ownership";

describe("checkGuestStatusMemberOwnership", () => {
  test("session 無しは常に ok", () => {
    expect(
      checkGuestStatusMemberOwnership({
        sessionCustomerId: null,
        resourceCustomerId: "customer-a",
      }),
    ).toEqual({ kind: "ok" });
  });

  test("未 claim（resourceCustomerId null）は ok", () => {
    expect(
      checkGuestStatusMemberOwnership({
        sessionCustomerId: "customer-a",
        resourceCustomerId: null,
      }),
    ).toEqual({ kind: "ok" });
  });

  test("session customer と resource customer が一致すれば ok", () => {
    expect(
      checkGuestStatusMemberOwnership({
        sessionCustomerId: "customer-a",
        resourceCustomerId: "customer-a",
      }),
    ).toEqual({ kind: "ok" });
  });

  test("session customer と resource customer が不一致なら mismatch", () => {
    expect(
      checkGuestStatusMemberOwnership({
        sessionCustomerId: "customer-a",
        resourceCustomerId: "customer-b",
      }),
    ).toEqual({ kind: "mismatch" });
  });
});
