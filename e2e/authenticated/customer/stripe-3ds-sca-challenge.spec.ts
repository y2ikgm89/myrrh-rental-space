import { test, expect } from "../../fixtures/e2e-test";
import {
  customerReservationTargets,
  getReservationDetailHeader,
  getReservationDetailMain,
  openCustomerReservationDetail,
} from "./reservation-test-helpers";

/**
 * マイページ - Stripe 3DS / SCA challenge 後の顧客ランディング UX（顧客認証済み state）
 *
 * ## 対象範囲（顧客が実際に触る UX 面）
 *
 * 日本のクレジットカードは 3DS / SCA (Strong Customer Authentication) 認証が
 * 発火するケースが多く、Stripe Checkout Session を PaymentIntent は
 * `requires_confirmation → requires_action` に遷移させ、Stripe hosted checkout
 * 上で 3DS チャレンジ画面を挿入する。チャレンジの結果に応じて Stripe は
 * 以下の URL に戻す（`src/shared/domain/reservations/payment-commands.ts`
 * の `createCheckoutSessionCommand` — success_url / cancel_url）:
 *
 * - チャレンジ成功 → `/mypage/reservations/{id}?payment=success`
 * - チャレンジ失敗 / 顧客キャンセル → `/mypage/reservations/{id}?payment=cancelled`
 *
 * 本 spec はこの 2 経路の顧客ランディング UX を担保する:
 *
 * 1. 成功後のランディングで PAID ステータス表示が読める（既に seed で PAID の予約に
 *    `?payment=success` を付けてアクセス — webhook 経路は独立のため、遅延分は
 *    独立に担保する）。
 * 2. 失敗 / キャンセル後のランディングで **再決済 CTA が復活する** ことを担保する
 *    — 3DS 失敗後にセッション期限切れ webhook が `paymentStatus: FAILED` に
 *    flip するケースでもマイページから決済再試行できる契約
 *    （`reservation-detail.tsx` の `paymentStatusEnum ∈ {UNPAID, FAILED}` gate
 *    — PR#7 + Codex P1 #1022 + #8 FAILED gate 緩和で確立した「一度離脱しても
 *    admin 手動リセット無しで再決済できる」体験）。
 *
 * ## 範囲外（明示）
 *
 * - **Stripe Checkout hosted の 3DS iframe 内操作**（テストカード
 *   `4000002500003155` / `4000008400001629` を直接 Playwright で押下する経路）:
 *   E2E webServer は Stripe credentials を配線しておらず (`playwright.config.ts`
 *   に STRIPE_SECRET_KEY / webhook secret が無い)、Stripe hosted iframe は同一
 *   origin で無いため cross-origin iframe を Playwright が越えられない。3DS
 *   フロー自体は Stripe SDK の integration test 側と Stripe Radar のテストで
 *   担保する。
 * - **Webhook 経路** (`checkout.session.completed` / `async_payment_*` /
 *   `charge.refunded` の状態遷移): `src/app/api/webhooks/stripe/route.ts` は
 *   `assertOnlinePaymentAvailable` (DB Settings の Stripe credentials + Feature
 *   Module ON) 前提で走るため E2E 環境では 503 を返す。unit /
 *   integration テスト側 (`__tests__/integration/api/webhooks/`) で担保する。
 * - **PaymentIntent status 直接検証** (requires_confirmation → requires_action):
 *   Stripe API を叩かないと観測できないため E2E 対象外。
 *
 * 前提（seed-driven、`prisma/seed.ts` § seedDevCustomerAndReservations 経由）:
 * - dev customer に COMPLETED+PAID (3DS 成功後の landing 検証用) と
 *   CONFIRMED+UNPAID (3DS 失敗後の landing + 再決済 CTA 検証用) が確実に存在
 * - `e2e/auth/customer.setup.ts` が認証済 storage state を生成済
 */

test.describe("Stripe 3DS / SCA - チャレンジ成功後のマイページランディング", () => {
  test("?payment=success 付きで着地した PAID 予約は支払い済みステータスを表示する", async ({
    page,
  }) => {
    // 通常フロー (openCustomerReservationDetail) は一覧経由でクリック遷移するが、
    // 3DS 成功後の Stripe redirect は「直接 URL アクセス」で reservation 詳細に
    // `?payment=success` を付けて着地する契約。ここではその契約に沿って一覧を
    // 経由し、対象詳細 URL に query を付けて再アクセスする。
    await openCustomerReservationDetail(
      page,
      customerReservationTargets.completedPaid,
    );

    // 現在の URL に `?payment=success` を付けて再アクセス
    const detailUrl = new URL(page.url());
    detailUrl.search = "payment=success";
    await page.goto(detailUrl.pathname + detailUrl.search);

    // URL の query が予約詳細のレンダリングを壊していないこと
    await expect(page).toHaveURL(
      /\/mypage\/reservations\/[^/]+\?payment=success$/u,
    );

    await expect(
      getReservationDetailHeader(page, "ミーティングルーム A").getByText(
        "支払い済み",
        { exact: true },
      ),
    ).toBeVisible();

    // PAID 予約では再決済 CTA (checkout retry button) は表示されない
    // — 3DS 成功で確定した予約に retry ボタンが混入すると多重決済になる
    await expect(
      getReservationDetailMain(page).getByRole("button", {
        name: /オンラインで決済する|決済ページへ移動中/u,
      }),
    ).not.toBeVisible();
  });
});

test.describe("Stripe 3DS / SCA - チャレンジ失敗 / キャンセル後のマイページランディング", () => {
  test("?payment=cancelled 付きで着地した UNPAID 予約は再決済 CTA を復活させる", async ({
    page,
  }) => {
    // 3DS チャレンジで顧客が失敗 / 中断した経路: Stripe が cancel_url に redirect
    // し、reservation は paymentStatus=UNPAID (または session.expired webhook で
    // FAILED) のまま。マイページ詳細で「オンラインで決済する」ボタンが復活していれば、
    // admin 手動リセット無しで再決済できる契約が守られている
    // （`reservation-detail.tsx` の paymentStatusEnum ∈ {UNPAID, FAILED} gate）。
    await openCustomerReservationDetail(
      page,
      customerReservationTargets.confirmedUnpaid,
    );

    const detailUrl = new URL(page.url());
    detailUrl.search = "payment=cancelled";
    await page.goto(detailUrl.pathname + detailUrl.search);

    await expect(page).toHaveURL(
      /\/mypage\/reservations\/[^/]+\?payment=cancelled$/u,
    );

    // 未払いステータスがそのまま表示される (webhook 遅延で UNPAID/PENDING/FAILED の
    // いずれでも良いが、3DS 失敗直後は概ね UNPAID のまま)
    await expect(
      getReservationDetailHeader(page, "ミーティングルーム A").getByText(
        "未払い",
        { exact: true },
      ),
    ).toBeVisible();

    // 再決済 CTA (checkout button) が表示されていること。button label は
    // `CheckoutButton` の実装参照 (`isPending` false 時 = "オンラインで決済する")
    await expect(
      getReservationDetailMain(page).getByRole("button", {
        name: "オンラインで決済する",
      }),
    ).toBeVisible();
  });
});
