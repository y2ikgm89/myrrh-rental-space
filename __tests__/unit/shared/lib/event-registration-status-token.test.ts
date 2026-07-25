import { describe, test, expect } from "bun:test";
import {
  createEventRegistrationStatusToken,
  verifyEventRegistrationStatusToken,
  EVENT_REGISTRATION_STATUS_TOKEN_LIFETIME_MS,
} from "@/shared/lib/event-registration-status-token";
import { createCancelToken } from "@/shared/lib/event-registration-cancel-token";
import { createEventRegistrationClaimToken } from "@/shared/lib/event-registration-claim-token";
import { createStatusToken } from "@/shared/lib/reservation-status-token";
import { MS_PER_DAY } from "@/shared/lib/date-format";

const RID = "clxxxxxxxxxxxxxxxxxxxxxxxxx";

describe("createEventRegistrationStatusToken / verifyEventRegistrationStatusToken", () => {
  test("往復で registrationId を復元できる", () => {
    const now = new Date("2026-04-01T00:00:00Z");
    const exp = new Date("2026-04-02T00:00:00Z");
    const token = createEventRegistrationStatusToken(RID, exp);
    expect(verifyEventRegistrationStatusToken(token, now)).toEqual({
      valid: true,
      registrationId: RID,
    });
  });

  test("トークンは URL セーフ（base64url 文字のみ）", () => {
    const token = createEventRegistrationStatusToken(
      RID,
      new Date("2026-04-02T00:00:00Z"),
    );
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/u);
  });

  test("有効期限を過ぎたトークンは無効", () => {
    const exp = new Date("2026-04-01T00:00:00Z");
    const now = new Date("2026-04-01T00:00:01Z");
    const token = createEventRegistrationStatusToken(RID, exp);
    expect(verifyEventRegistrationStatusToken(token, now)).toEqual({
      valid: false,
    });
  });

  test("ちょうど有効期限なら有効（境界値）", () => {
    const at = new Date("2026-04-01T00:00:00Z");
    const token = createEventRegistrationStatusToken(RID, at);
    expect(verifyEventRegistrationStatusToken(token, at)).toEqual({
      valid: true,
      registrationId: RID,
    });
  });

  test("推奨 TTL は mint から 90 日", () => {
    expect(EVENT_REGISTRATION_STATUS_TOKEN_LIFETIME_MS).toBe(90 * MS_PER_DAY);
    const mintedAt = new Date("2026-04-01T00:00:00Z");
    const expiresAt = new Date(
      mintedAt.getTime() + EVENT_REGISTRATION_STATUS_TOKEN_LIFETIME_MS,
    );
    const token = createEventRegistrationStatusToken(RID, expiresAt);
    expect(verifyEventRegistrationStatusToken(token, mintedAt)).toEqual({
      valid: true,
      registrationId: RID,
    });
    expect(
      verifyEventRegistrationStatusToken(
        token,
        new Date(expiresAt.getTime() + 1),
      ),
    ).toEqual({ valid: false });
  });

  test("改ざんされたトークンは無効", () => {
    const token = createEventRegistrationStatusToken(
      RID,
      new Date("2026-04-02T00:00:00Z"),
    );
    const tampered =
      token.slice(0, -4) + (token.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(
      verifyEventRegistrationStatusToken(
        tampered,
        new Date("2026-04-01T00:00:00Z"),
      ),
    ).toEqual({ valid: false });
  });

  test("トークン形式でない文字列は無効", () => {
    expect(
      verifyEventRegistrationStatusToken(
        "not-a-real-token",
        new Date("2026-04-01T00:00:00Z"),
      ),
    ).toEqual({ valid: false });
  });
});

describe("purpose 分離（キャンセル・claim・予約 status の流用を拒否）", () => {
  const now = new Date("2026-04-01T00:00:00Z");
  const exp = new Date("2026-04-02T00:00:00Z");

  test("キャンセルトークンはステータストークンとして拒否される", () => {
    const cancelToken = createCancelToken(RID, exp);
    expect(verifyEventRegistrationStatusToken(cancelToken, now)).toEqual({
      valid: false,
    });
  });

  test("claim トークンはステータストークンとして拒否される", () => {
    const claimToken = createEventRegistrationClaimToken(RID, now);
    expect(verifyEventRegistrationStatusToken(claimToken, now)).toEqual({
      valid: false,
    });
  });

  test("予約ステータストークンはイベントステータストークンとして拒否される", () => {
    const reservationStatus = createStatusToken(RID, exp);
    expect(verifyEventRegistrationStatusToken(reservationStatus, now)).toEqual({
      valid: false,
    });
  });
});
