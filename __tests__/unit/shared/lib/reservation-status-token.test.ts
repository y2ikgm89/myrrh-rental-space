import { describe, test, expect } from "bun:test";
import {
  createStatusToken,
  verifyStatusToken,
  STATUS_TOKEN_LIFETIME_MS,
} from "@/shared/lib/reservation-status-token";
import { createCompleteToken } from "@/shared/lib/reservation-complete-token";
import { createCancelToken } from "@/shared/lib/reservation-cancel-token";
import { MS_PER_DAY } from "@/shared/lib/date-format";

const RID = "44444444-4444-4444-8444-444444444444";

describe("createStatusToken / verifyStatusToken", () => {
  test("往復で reservationId を復元できる", () => {
    const now = new Date("2026-04-01T00:00:00Z");
    const exp = new Date("2026-04-02T00:00:00Z");
    const token = createStatusToken(RID, exp);
    expect(verifyStatusToken(token, now)).toEqual({
      valid: true,
      reservationId: RID,
    });
  });

  test("トークンは URL セーフ（base64url 文字のみ）", () => {
    const token = createStatusToken(RID, new Date("2026-04-02T00:00:00Z"));
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/u);
  });

  test("有効期限を過ぎたトークンは無効", () => {
    const exp = new Date("2026-04-01T00:00:00Z");
    const now = new Date("2026-04-01T00:00:01Z");
    const token = createStatusToken(RID, exp);
    expect(verifyStatusToken(token, now)).toEqual({ valid: false });
  });

  test("ちょうど有効期限なら有効（境界値）", () => {
    const at = new Date("2026-04-01T00:00:00Z");
    const token = createStatusToken(RID, at);
    expect(verifyStatusToken(token, at)).toEqual({
      valid: true,
      reservationId: RID,
    });
  });

  test("推奨 TTL は mint から 90 日", () => {
    expect(STATUS_TOKEN_LIFETIME_MS).toBe(90 * MS_PER_DAY);
    const mintedAt = new Date("2026-04-01T00:00:00Z");
    const expiresAt = new Date(mintedAt.getTime() + STATUS_TOKEN_LIFETIME_MS);
    const token = createStatusToken(RID, expiresAt);
    expect(verifyStatusToken(token, mintedAt)).toEqual({
      valid: true,
      reservationId: RID,
    });
    expect(verifyStatusToken(token, new Date(expiresAt.getTime() + 1))).toEqual(
      { valid: false },
    );
  });

  test("改ざんされたトークンは無効", () => {
    const token = createStatusToken(RID, new Date("2026-04-02T00:00:00Z"));
    const tampered =
      token.slice(0, -4) + (token.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(
      verifyStatusToken(tampered, new Date("2026-04-01T00:00:00Z")),
    ).toEqual({ valid: false });
  });

  test("トークン形式でない文字列は無効", () => {
    expect(
      verifyStatusToken("not-a-real-token", new Date("2026-04-01T00:00:00Z")),
    ).toEqual({ valid: false });
  });
});

describe("purpose 分離（完了・キャンセル トークンの流用を拒否）", () => {
  const now = new Date("2026-04-01T00:00:00Z");
  const exp = new Date("2026-04-02T00:00:00Z");

  test("完了トークンはステータストークンとして拒否される", () => {
    const completeToken = createCompleteToken(RID, exp);
    expect(verifyStatusToken(completeToken, now)).toEqual({ valid: false });
  });

  test("キャンセルトークンはステータストークンとして拒否される", () => {
    const cancelToken = createCancelToken(RID, exp);
    expect(verifyStatusToken(cancelToken, now)).toEqual({ valid: false });
  });
});
