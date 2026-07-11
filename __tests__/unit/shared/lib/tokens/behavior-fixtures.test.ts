/**
 * DUP-1 Alt-C 後の 6 トークン挙動マトリクス。
 *
 * 各 token verify 関数について:
 *   - 正常経路（happy）
 *   - 期限切れ（expired、reason 付き型は "expired" を assert）
 *   - cross-purpose（誤 purpose で暗号化した ciphertext）
 *   - malformed / 非トークン文字列
 *   - v1 wire prefix rejection
 *
 * を一つの table で回す。crypto.ts への expectedPurpose 移設で
 * 「per-file の parts[] pre-check を消す」ことによる挙動差ゼロを固定する。
 */

import { describe, test, expect, mock } from "bun:test";

interface EncryptionKey {
  kid: string;
  hex: string;
}

const PRIMARY: EncryptionKey = { kid: "v1", hex: "a".repeat(64) };
const mockGetPrimary = mock<() => EncryptionKey>(() => PRIMARY);

mock.module("@/shared/lib/env/encryption", () => ({
  getPrimaryEncryptionKey: mockGetPrimary,
}));

const { encrypt } = await import("@/shared/lib/crypto");
const {
  createCancelToken: createResCancel,
  verifyCancelToken: verifyResCancel,
} = await import("@/shared/lib/reservation-cancel-token");
const { createCompleteToken, verifyCompleteToken } =
  await import("@/shared/lib/reservation-complete-token");
const { createReservationClaimToken, verifyReservationClaimToken } =
  await import("@/shared/lib/reservation-claim-token");
const {
  createCancelToken: createEvtCancel,
  verifyCancelToken: verifyEvtCancel,
} = await import("@/shared/lib/event-registration-cancel-token");
const { createEventRegistrationClaimToken, verifyEventRegistrationClaimToken } =
  await import("@/shared/lib/event-registration-claim-token");
const { createCalendarToken, verifyCalendarToken } =
  await import("@/shared/lib/calendar/calendar-token");

type Result =
  { valid: true } | { valid: false; reason?: "invalid" | "expired" };

interface Row {
  name: string;
  purpose: string;
  hasReason: boolean;
  mint: () => string;
  verify: (t: string, now: Date) => Result;
}

const RID = "11111111-1111-4111-8111-111111111111";
const EID = "22222222-2222-4222-8222-222222222222";
const HAPPY_ISSUED = new Date("2026-04-01T00:00:00Z");
const HAPPY_NOW = new Date("2026-04-01T00:00:01Z");
const FUTURE_EXP = new Date("2026-04-02T00:00:00Z");
// 30 日を大きく超える未来: いずれのトークン TTL も無効化される
const LONG_AFTER = new Date("2026-06-01T00:00:00Z");

const rows: Row[] = [
  {
    name: "reservation-cancel",
    purpose: "reservation-cancel",
    hasReason: true,
    mint: () => createResCancel(RID, FUTURE_EXP, HAPPY_ISSUED),
    verify: (t, now) => verifyResCancel(t, now),
  },
  {
    name: "reservation-complete",
    purpose: "reservation-complete",
    hasReason: false,
    mint: () => createCompleteToken(RID, FUTURE_EXP),
    verify: (t, now) => verifyCompleteToken(t, now),
  },
  {
    name: "reservation-claim",
    purpose: "reservation-claim",
    hasReason: false,
    mint: () => createReservationClaimToken(RID, HAPPY_ISSUED),
    verify: (t, now) => verifyReservationClaimToken(t, now),
  },
  {
    name: "event-registration-cancel",
    purpose: "event-registration-cancel",
    hasReason: true,
    mint: () => createEvtCancel(EID, FUTURE_EXP, HAPPY_ISSUED),
    verify: (t, now) => verifyEvtCancel(t, now),
  },
  {
    name: "event-registration-claim",
    purpose: "event-registration-claim",
    hasReason: false,
    mint: () => createEventRegistrationClaimToken(EID, HAPPY_ISSUED),
    verify: (t, now) => verifyEventRegistrationClaimToken(t, now),
  },
  {
    name: "calendar-reservation",
    purpose: "calendar-download-reservation",
    hasReason: true,
    mint: () => createCalendarToken("reservation", RID, HAPPY_ISSUED),
    verify: (t, now) => verifyCalendarToken(t, "reservation", now),
  },
];

describe("token verify behavior matrix (post DUP-1 Alt-C)", () => {
  for (const row of rows) {
    describe(row.name, () => {
      test("happy: valid=true が返る", () => {
        const t = row.mint();
        expect(row.verify(t, HAPPY_NOW).valid).toBe(true);
      });

      test("expired: valid=false（reason 付き型は 'expired'）", () => {
        const t = row.mint();
        const r = row.verify(t, LONG_AFTER);
        expect(r.valid).toBe(false);
        if (row.hasReason && !r.valid) {
          expect(r.reason).toBe("expired");
        }
      });

      test("cross-purpose: 誤 purpose の ciphertext は valid=false", () => {
        // 誤 purpose "generic" で暗号化した plausible payload を base64url でくるむ。
        const wrongCipher = encrypt(
          JSON.stringify({
            rid: RID,
            eid: EID,
            id: RID,
            k: "reservation",
            exp: Date.now() + 60_000,
            iat: Date.now(),
          }),
          { purpose: "generic" },
        );
        const crossToken = Buffer.from(wrongCipher, "utf8").toString(
          "base64url",
        );
        const r = row.verify(crossToken, HAPPY_NOW);
        expect(r.valid).toBe(false);
        if (row.hasReason && !r.valid) {
          expect(r.reason).toBe("invalid");
        }
      });

      test("malformed: 非トークン文字列は valid=false", () => {
        const r = row.verify("not-a-real-token", HAPPY_NOW);
        expect(r.valid).toBe(false);
        if (row.hasReason && !r.valid) {
          expect(r.reason).toBe("invalid");
        }
      });

      test("wire v1 prefix: legacy 形式は valid=false", () => {
        const legacyPlain = `v1:${row.purpose}:AAAAAAAAAAAAAAAA:AAAAAAAAAAAAAAAAAAAAAA==:dGVzdA==`;
        const legacyToken = Buffer.from(legacyPlain, "utf8").toString(
          "base64url",
        );
        const r = row.verify(legacyToken, HAPPY_NOW);
        expect(r.valid).toBe(false);
        if (row.hasReason && !r.valid) {
          expect(r.reason).toBe("invalid");
        }
      });
    });
  }
});
