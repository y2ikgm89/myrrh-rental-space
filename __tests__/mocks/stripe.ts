/**
 * Stripe API モック
 *
 * Stripe 連携をテストするためのモック実装
 */

import { mock } from "bun:test";

// =============================================================================
// Types
// =============================================================================

export interface MockCustomer {
  id: string;
  email: string;
  name?: string | undefined;
  metadata?: Record<string, string> | undefined;
}

export interface MockPaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status:
    | "requires_payment_method"
    | "requires_confirmation"
    | "succeeded"
    | "canceled";
  customer?: string | undefined;
  metadata?: Record<string, string> | undefined;
}

export interface MockSubscription {
  id: string;
  customer: string;
  status: "active" | "canceled" | "past_due" | "unpaid";
  items: { data: { price: { id: string } }[] };
}

// =============================================================================
// Mock Data Storage
// =============================================================================

export const mockCustomers: MockCustomer[] = [];
export const mockPaymentIntents: MockPaymentIntent[] = [];
export const mockSubscriptions: MockSubscription[] = [];

// =============================================================================
// Mock Functions
// =============================================================================

/**
 * customers.create のモック
 */
export const mockCustomersCreate = mock<
  (params: {
    email: string;
    name?: string;
    metadata?: Record<string, string>;
  }) => Promise<MockCustomer>
>((params) => {
  const customer: MockCustomer = {
    id: `cus_mock_${Date.now()}`,
    email: params.email,
    name: params.name,
    metadata: params.metadata,
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
  (params: {
    amount: number;
    currency: string;
    customer?: string;
    metadata?: Record<string, string>;
  }) => Promise<MockPaymentIntent>
>((params) => {
  const paymentIntent: MockPaymentIntent = {
    id: `pi_mock_${Date.now()}`,
    amount: params.amount,
    currency: params.currency,
    status: "requires_payment_method",
    customer: params.customer,
    metadata: params.metadata,
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
  (params: {
    customer: string;
    items: { price: string }[];
  }) => Promise<MockSubscription>
>((params) => {
  const subscription: MockSubscription = {
    id: `sub_mock_${Date.now()}`,
    customer: params.customer,
    status: "active",
    items: {
      data: params.items.map((item) => ({ price: { id: item.price } })),
    },
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
