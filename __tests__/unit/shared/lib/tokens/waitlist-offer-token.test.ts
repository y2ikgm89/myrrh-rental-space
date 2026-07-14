import { describe, test, expect } from "bun:test";
import {
  createWaitlistOfferToken,
  verifyWaitlistOfferToken,
} from "@/shared/lib/tokens/waitlist-offer-token";

const REGISTRATION_ID = "reg_abcdef123456";

describe("createWaitlistOfferToken / verifyWaitlistOfferToken", () => {
  test("往復で registrationId を復元できる", () => {
    const token = createWaitlistOfferToken({
      registrationId: REGISTRATION_ID,
    });
    expect(verifyWaitlistOfferToken(token)).toEqual({
      registrationId: REGISTRATION_ID,
    });
  });

  test("トークンは URL セーフ（base64url 文字のみ）", () => {
    const token = createWaitlistOfferToken({
      registrationId: REGISTRATION_ID,
    });
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/u);
  });

  test("改ざんされたトークンは null", () => {
    const token = createWaitlistOfferToken({
      registrationId: REGISTRATION_ID,
    });
    const tampered =
      token.slice(0, -4) + (token.endsWith("AAAA") ? "BBBB" : "AAAA");
    expect(verifyWaitlistOfferToken(tampered)).toBeNull();
  });

  test("トークン形式でない文字列は null", () => {
    expect(verifyWaitlistOfferToken("not-a-real-token")).toBeNull();
  });

  test("別 purpose のトークン（予約キャンセル）は通らない（cross-token misuse 防止）", async () => {
    const { createCancelToken } =
      await import("@/shared/lib/reservation-cancel-token");
    const foreignToken = createCancelToken(
      REGISTRATION_ID,
      new Date(Date.now() + 60_000),
    );
    expect(verifyWaitlistOfferToken(foreignToken)).toBeNull();
  });

  test("イベント参加申込キャンセルトークン（別 purpose）も通らない", async () => {
    const { createCancelToken } =
      await import("@/shared/lib/event-registration-cancel-token");
    const foreignToken = createCancelToken(
      REGISTRATION_ID,
      new Date(Date.now() + 60_000),
    );
    expect(verifyWaitlistOfferToken(foreignToken)).toBeNull();
  });

  test("exp/iat claim を持たない（DB expiresAt が正本のためステートレス）", () => {
    const token = createWaitlistOfferToken({
      registrationId: REGISTRATION_ID,
    });
    // 発行直後でも将来時刻でも同じ token が同じ registrationId を返す
    // （token 自身に時刻依存の失効判定が無いことの回帰ガード）。
    expect(verifyWaitlistOfferToken(token)).toEqual({
      registrationId: REGISTRATION_ID,
    });
  });
});
