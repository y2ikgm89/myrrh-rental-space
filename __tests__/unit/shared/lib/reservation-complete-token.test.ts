import { describe, test, expect } from "bun:test";
import {
  createCompleteToken,
  verifyCompleteToken,
} from "@/shared/lib/reservation-complete-token";
import {
  createCancelToken,
  verifyCancelToken,
} from "@/shared/lib/reservation-cancel-token";

const RID = "22222222-2222-4222-8222-222222222222";

describe("createCompleteToken / verifyCompleteToken", () => {
  test("往復で reservationId を復元できる", () => {
    const now = new Date("2026-04-01T00:00:00Z");
    const exp = new Date("2026-04-02T00:00:00Z");
    const token = createCompleteToken(RID, exp);
    expect(verifyCompleteToken(token, now)).toEqual({
      valid: true,
      reservationId: RID,
    });
  });

  test("トークンは URL セーフ（base64url 文字のみ）", () => {
    const token = createCompleteToken(RID, new Date("2026-04-02T00:00:00Z"));
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/u);
  });

  test("有効期限を過ぎたトークンは無効", () => {
    const exp = new Date("2026-04-01T00:00:00Z");
    const now = new Date("2026-04-01T00:00:01Z"); // exp の 1 秒後
    const token = createCompleteToken(RID, exp);
    expect(verifyCompleteToken(token, now)).toEqual({ valid: false });
  });

  test("ちょうど有効期限なら有効（境界値）", () => {
    const at = new Date("2026-04-01T00:00:00Z");
    const token = createCompleteToken(RID, at);
    expect(verifyCompleteToken(token, at)).toEqual({
      valid: true,
      reservationId: RID,
    });
  });

  test("改ざんされたトークンは無効", () => {
    const token = createCompleteToken(RID, new Date("2026-04-02T00:00:00Z"));
    const tampered =
      token.slice(0, -4) + (token.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(
      verifyCompleteToken(tampered, new Date("2026-04-01T00:00:00Z")),
    ).toEqual({ valid: false });
  });

  test("トークン形式でない文字列は無効", () => {
    expect(
      verifyCompleteToken("not-a-real-token", new Date("2026-04-01T00:00:00Z")),
    ).toEqual({ valid: false });
  });
});

describe("purpose 分離（キャンセル ↔ 完了トークンの相互流用を拒否）", () => {
  const now = new Date("2026-04-01T00:00:00Z");
  const exp = new Date("2026-04-02T00:00:00Z");

  test("キャンセルトークンは完了トークンとして拒否される", () => {
    const cancelToken = createCancelToken(RID, exp);
    expect(verifyCompleteToken(cancelToken, now)).toEqual({ valid: false });
  });

  test("完了トークンはキャンセルトークンとして拒否される", () => {
    const completeToken = createCompleteToken(RID, exp);
    expect(verifyCancelToken(completeToken, now)).toEqual({
      valid: false,
      reason: "invalid",
    });
  });
});
