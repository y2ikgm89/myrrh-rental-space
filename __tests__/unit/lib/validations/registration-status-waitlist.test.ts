import { describe, expect, it } from "bun:test";
import { RegistrationStatus } from "@/shared/lib/validations/enums/prisma-types";
import {
  ACTIVE_REGISTRATION_STATUSES,
  CANCELLABLE_REGISTRATION_STATUSES,
  WAITLIST_ACTIVE_STATUSES,
  WAITLIST_TERMINAL_STATUSES,
  isValidRegistrationStatus,
} from "@/shared/lib/validations/enums/helpers";

describe("RegistrationStatus helpers", () => {
  it("CANCELLABLE = CONFIRMED + WAITLIST 系のみ (EXPIRED/CANCELLED は含まない)", () => {
    expect(CANCELLABLE_REGISTRATION_STATUSES).toEqual([
      RegistrationStatus.CONFIRMED,
      RegistrationStatus.WAITLISTED,
      RegistrationStatus.WAITLISTED_OFFERED,
    ]);
  });

  it("WAITLIST_ACTIVE = WAITLISTED + WAITLISTED_OFFERED", () => {
    expect(WAITLIST_ACTIVE_STATUSES).toEqual([
      RegistrationStatus.WAITLISTED,
      RegistrationStatus.WAITLISTED_OFFERED,
    ]);
  });

  it("WAITLIST_TERMINAL = EXPIRED + CANCELLED", () => {
    expect(WAITLIST_TERMINAL_STATUSES).toEqual([
      RegistrationStatus.EXPIRED,
      RegistrationStatus.CANCELLED,
    ]);
  });

  it("ACTIVE = CONFIRMED + WAITLIST_ACTIVE (mypage これから)", () => {
    expect(ACTIVE_REGISTRATION_STATUSES).toEqual([
      RegistrationStatus.CONFIRMED,
      RegistrationStatus.WAITLISTED,
      RegistrationStatus.WAITLISTED_OFFERED,
    ]);
  });

  it("isValidRegistrationStatus は 5 値のみ true", () => {
    expect(isValidRegistrationStatus("CONFIRMED")).toBe(true);
    expect(isValidRegistrationStatus("WAITLISTED")).toBe(true);
    expect(isValidRegistrationStatus("WAITLISTED_OFFERED")).toBe(true);
    expect(isValidRegistrationStatus("EXPIRED")).toBe(true);
    expect(isValidRegistrationStatus("CANCELLED")).toBe(true);
    expect(isValidRegistrationStatus("UNKNOWN")).toBe(false);
    expect(isValidRegistrationStatus(null)).toBe(false);
  });
});
