/**
 * Stripe API モック
 *
 * Stripe 連携をテストするためのモック実装。
 *
 * ## 型整合の方針
 * 公式 Stripe SDK (`stripe`) の型（`Stripe.Customer` / `Stripe.PaymentIntent` /
 * `Stripe.Subscription` / `Stripe.Checkout.Session` など）を **直接 import** し、
 * モック関数のパラメータ・戻り値型として再利用する。
 *
 * SDK の major bump（例: customer の email が nullable 化、PaymentIntent.status の
 * 列挙拡張、Subscription.items シェイプ変更など）が起きたとき、ハンドラの実装より
 * **テストの mock factory が先に型エラーで落ちる**ことで silent contract drift を
 * 検知する。手書きの `MockCustomer` / `MockPaymentIntent` 型では SDK の進化を
 * 取りこぼし、本番 webhook が 500 になってから気付くため必ず SDK 型を経由する。
 *
 * @see https://github.com/stripe/stripe-node — `Stripe.*` 名前空間が公式 type SSoT
 */

import { mock } from "bun:test";
import type Stripe from "stripe";

// =============================================================================
// Types — Stripe SDK 公式型のサブセット
// =============================================================================

/**
 * テストで保持する Customer の最小サブセット。
 * `Stripe.Customer` の上位互換シェイプから必要 field のみ pick する。
 */
export type MockCustomer = Pick<
  Stripe.Customer,
  "id" | "email" | "name" | "metadata"
>;

/**
 * テストで保持する PaymentIntent の最小サブセット。
 * `status` は SDK の literal union（`Stripe.PaymentIntent.Status`）を維持。
 */
export type MockPaymentIntent = Pick<
  Stripe.PaymentIntent,
  "id" | "amount" | "currency" | "status" | "customer" | "metadata"
>;

/**
 * テストで保持する Subscription の最小サブセット。
 * `status` は SDK の literal union（`Stripe.Subscription.Status`）を維持。
 */
export type MockSubscription = Pick<
  Stripe.Subscription,
  "id" | "customer" | "status" | "items"
>;

// =============================================================================
// Mock Data Storage
// =============================================================================

export const mockCustomers: MockCustomer[] = [];
export const mockPaymentIntents: MockPaymentIntent[] = [];
export const mockSubscriptions: MockSubscription[] = [];

// =============================================================================
// Mock Functions — SDK の `Stripe.*Resource.*Params` を採用
// =============================================================================

/**
 * customers.create のモック
 */
export const mockCustomersCreate = mock<
  (params: Stripe.CustomerCreateParams) => Promise<MockCustomer>
>((params) => {
  const customer: MockCustomer = {
    id: `cus_mock_${Date.now()}`,
    email: params.email ?? null,
    name: params.name ?? null,
    // CustomerCreateParams.metadata は MetadataParam（number/null 許容）。
    // 応答型の Customer.metadata は string-only な map なので明示変換する。
    metadata: Object.fromEntries(
      Object.entries(params.metadata ?? {}).map(([k, v]) => [
        k,
        v === null || v === undefined ? "" : String(v),
      ]),
    ) as Stripe.Customer["metadata"],
  };
  mockCustomers.push(customer);
  return Promise.resolve(customer);
});

/**
 * customers.retrieve のモック
 */
export const mockCustomersRetrieve = mock<
  (customerId: string) => Promise<MockCustomer | null>
>((customerId) => {
  const customer = mockCustomers.find((c) => c.id === customerId);
  return Promise.resolve(customer ?? null);
});

/**
 * paymentIntents.create のモック
 */
export const mockPaymentIntentsCreate = mock<
  (params: Stripe.PaymentIntentCreateParams) => Promise<MockPaymentIntent>
>((params) => {
  const paymentIntent: MockPaymentIntent = {
    id: `pi_mock_${Date.now()}`,
    amount: params.amount,
    currency: params.currency,
    status: "requires_payment_method",
    customer: params.customer ?? null,
    // PaymentIntentCreateParams.metadata は MetadataParam（number/null 許容）。
    // 応答型の PaymentIntent.metadata は string-only な map に正規化する。
    metadata: Object.fromEntries(
      Object.entries(params.metadata ?? {}).map(([k, v]) => [
        k,
        v === null || v === undefined ? "" : String(v),
      ]),
    ) as Stripe.PaymentIntent["metadata"],
  };
  mockPaymentIntents.push(paymentIntent);
  return Promise.resolve(paymentIntent);
});

/**
 * paymentIntents.confirm のモック
 */
export const mockPaymentIntentsConfirm = mock<
  (paymentIntentId: string) => Promise<MockPaymentIntent>
>((paymentIntentId) => {
  const intent = mockPaymentIntents.find((pi) => pi.id === paymentIntentId);
  if (intent) {
    intent.status = "succeeded";
    return Promise.resolve(intent);
  }
  return Promise.reject(
    new Error(`PaymentIntent ${paymentIntentId} not found`),
  );
});

/**
 * subscriptions.create のモック
 */
export const mockSubscriptionsCreate = mock<
  (params: Stripe.SubscriptionCreateParams) => Promise<MockSubscription>
>((params) => {
  const items = (params.items ?? []).map(
    (item, index) =>
      ({
        id: `si_mock_${Date.now()}_${index}`,
        price: { id: item.price ?? "price_mock" },
      }) as unknown as Stripe.SubscriptionItem,
  );
  const subscription: MockSubscription = {
    id: `sub_mock_${Date.now()}`,
    customer: params.customer ?? `cus_mock_${Date.now()}`,
    status: "active",
    items: {
      object: "list",
      data: items,
      has_more: false,
      url: `/v1/subscription_items?subscription=sub_mock_${Date.now()}`,
    } as Stripe.ApiList<Stripe.SubscriptionItem>,
  };
  mockSubscriptions.push(subscription);
  return Promise.resolve(subscription);
});

/**
 * subscriptions.cancel のモック
 */
export const mockSubscriptionsCancel = mock<
  (subscriptionId: string) => Promise<MockSubscription>
>((subscriptionId) => {
  const subscription = mockSubscriptions.find((s) => s.id === subscriptionId);
  if (subscription) {
    subscription.status = "canceled";
    return Promise.resolve(subscription);
  }
  return Promise.reject(new Error(`Subscription ${subscriptionId} not found`));
});

/**
 * Stripe クライアントのモック
 */
export const mockStripeClient = {
  customers: {
    create: mockCustomersCreate,
    retrieve: mockCustomersRetrieve,
  },
  paymentIntents: {
    create: mockPaymentIntentsCreate,
    confirm: mockPaymentIntentsConfirm,
  },
  subscriptions: {
    create: mockSubscriptionsCreate,
    cancel: mockSubscriptionsCancel,
  },
};

// =============================================================================
// Test Utilities
// =============================================================================

/**
 * モックをリセット
 */
export function resetStripeMock(): void {
  mockCustomers.length = 0;
  mockPaymentIntents.length = 0;
  mockSubscriptions.length = 0;
  mockCustomersCreate.mockClear();
  mockCustomersRetrieve.mockClear();
  mockPaymentIntentsCreate.mockClear();
  mockPaymentIntentsConfirm.mockClear();
  mockSubscriptionsCreate.mockClear();
  mockSubscriptionsCancel.mockClear();
}

/**
 * モック顧客を取得
 */
export function getMockCustomers(): MockCustomer[] {
  return [...mockCustomers];
}

/**
 * モック支払いインテントを取得
 */
export function getMockPaymentIntents(): MockPaymentIntent[] {
  return [...mockPaymentIntents];
}
