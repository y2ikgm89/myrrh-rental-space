import { test, expect } from "@playwright/test";
import Stripe from "stripe";
import { setupStripeWebhookFixture } from "../helpers/setup-stripe-webhook-fixture";

/**
 * E2E-02: Stripe webhook `StripeEvent` dedup chokepoint regression gate。
 *
 * STRIPE-DEDUP-A (PR #1229) が Stripe 公式 "handle-duplicate-events" 推奨に沿って
 * `event.id` を primary key に持つ `StripeEvent` テーブルへ INSERT を試み、
 * P2002 unique conflict を duplicate 判定に使う chokepoint を追加した。unit テスト
 * (`__tests__/unit/api/stripe-webhook-event-dedup.test.ts`) は境界差替で分岐契約を
 * 検証しているが、実 DB + 実署名検証 + 実 route handler を貫通した regression gate
 * が欠けていた。本 spec がそれを担う。
 *
 * ## 検証観点
 *
 * 1. **初回配送**: 既知 event.id (`evt_test_dedup_1`) の署名済 payload を POST →
 *    200 かつ body に `received: true` / `duplicate` フィールド無し。
 * 2. **replay**: 同じ event.id の署名済 payload を再 POST → 200 かつ
 *    `received: true, duplicate: true`。chokepoint が P2002 で短絡する契約。
 * 3. **独立性**: 異なる event.id (`evt_test_dedup_2`) → 再度初回配送扱いで
 *    200 + `duplicate` フィールド無し (event.id 毎に独立)。
 *
 * ## 対象範囲外
 *
 * - Reservation / EventRegistration の state 遷移: `metadata.reservationId` を
 *   持たない payload を使うため `extractPaymentSubject` が null で早期 return する。
 *   状態遷移は unit + integration で網羅済み (`payment-queries.test.ts` 系)。
 * - 署名失敗ケース: chokepoint より前で 400 return する契約は同 unit test
 *   (`stripe-webhook-event-dedup.test.ts` の「署名検証失敗 → chokepoint より前で
 *   400」) が既に carrying する。
 *
 * ## 前提 / 契約
 *
 * - webServer 起動時に seed が Stripe secret / webhook secret を書かないため、
 *   `beforeAll` で `scripts/e2e/setup-stripe-webhook-fixture.ts` を実行して
 *   Settings singleton に暗号化 secret を仕込む。fixture が返す plaintext
 *   webhook secret を Stripe SDK の `webhooks.generateTestHeaderString()` に渡して
 *   valid な `stripe-signature` header を生成する。
 * - Stripe secret / webhook secret は `getStripeCredentialCiphertext` 経由で
 *   キャッシュせず読むため、fixture 投入後は webhook 経路へ即座に反映される。
 * - `test.describe.serial` で 3 test を直列化する。event.id が dedup 契約の
 *   primary key で、fullyParallel だと初回配送と replay の順序が入れ替わって
 *   flake する。
 */

type WebhookResponseBody = {
  received?: boolean;
  duplicate?: boolean;
  error?: string;
};

function makeCheckoutCompletedPayload(eventId: string): string {
  // metadata に `reservationId` / `type` を含めないことで `extractPaymentSubject`
  // が logError + null return で早期終了する。DB を実際に書き換えず、
  // chokepoint → handler → markStripeEventProcessed の順序のみを検証する。
  const event = {
    id: eventId,
    object: "event",
    type: "checkout.session.completed",
    api_version: "2024-06-20",
    created: Math.floor(Date.now() / 1000),
    livemode: false,
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: {
      object: {
        id: "cs_test_dedup_regression",
        object: "checkout.session",
        payment_status: "paid",
        payment_intent: null,
        // metadata は明示的に空: extractPaymentSubject が null 返しで 200 短絡する
        metadata: {},
      },
    },
  };
  return JSON.stringify(event);
}

function signPayload(payload: string, secret: string): string {
  return Stripe.webhooks.generateTestHeaderString({
    payload,
    secret,
    timestamp: Math.floor(Date.now() / 1000),
  });
}

test.describe
  .serial("E2E-02: Stripe webhook StripeEvent dedup chokepoint", () => {
  let webhookSecret = "";

  test.beforeAll(async () => {
    const fixture = await setupStripeWebhookFixture();
    webhookSecret = fixture.webhookSecret;
  });

  test("初回配送 (evt_test_dedup_1) → 200 received:true / duplicate なし", async ({
    request,
  }) => {
    const payload = makeCheckoutCompletedPayload("evt_test_dedup_1");
    const signature = signPayload(payload, webhookSecret);

    const response = await request.post("/api/webhooks/stripe", {
      headers: {
        "stripe-signature": signature,
        "content-type": "application/json",
      },
      data: payload,
    });

    expect(response.status()).toBe(200);
    const body = (await response.json()) as WebhookResponseBody;
    expect(body.received).toBe(true);
    expect(body.duplicate).toBeUndefined();
  });

  test("replay 配送 (同 evt_test_dedup_1) → 200 received:true / duplicate:true", async ({
    request,
  }) => {
    const payload = makeCheckoutCompletedPayload("evt_test_dedup_1");
    const signature = signPayload(payload, webhookSecret);

    const response = await request.post("/api/webhooks/stripe", {
      headers: {
        "stripe-signature": signature,
        "content-type": "application/json",
      },
      data: payload,
    });

    expect(response.status()).toBe(200);
    const body = (await response.json()) as WebhookResponseBody;
    expect(body.received).toBe(true);
    expect(body.duplicate).toBe(true);
  });

  test("異なる event.id (evt_test_dedup_2) → 再び初回配送扱いで duplicate なし", async ({
    request,
  }) => {
    const payload = makeCheckoutCompletedPayload("evt_test_dedup_2");
    const signature = signPayload(payload, webhookSecret);

    const response = await request.post("/api/webhooks/stripe", {
      headers: {
        "stripe-signature": signature,
        "content-type": "application/json",
      },
      data: payload,
    });

    expect(response.status()).toBe(200);
    const body = (await response.json()) as WebhookResponseBody;
    expect(body.received).toBe(true);
    expect(body.duplicate).toBeUndefined();
  });
});
