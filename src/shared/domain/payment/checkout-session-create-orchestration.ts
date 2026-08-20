import "server-only";

import { DomainError } from "@/shared/domain/domain-error";
import { assertOnlinePaymentAvailable } from "@/shared/domain/payment/availability";
import { expireOpenCheckoutSessionBestEffort } from "@/shared/domain/payment/checkout-session-expiry";
import {
  handleCheckoutSessionCreateFailure,
  rejectCheckoutSessionSettle,
  revertCheckoutPendingToUnpaid,
  settleCheckoutSessionWrite,
  type PaymentUpdateManyRunner,
} from "@/shared/domain/payment/checkout-session-write-orchestration";
import { withStripeConnectionHealth } from "@/shared/domain/settings/connection-health";
import { getAppUrl } from "@/shared/lib/constants";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import { getStripeClient, type AsyncOnlyStripe } from "@/shared/lib/stripe";
import {
  findPaymentMethodsIncompatibleWithCurrency,
  isStripePaymentMethodType,
  type StripePaymentMethodType,
} from "@/shared/lib/stripe-payment-methods";

const STRIPE_MISCONFIGURED_MESSAGE =
  "Stripe の設定が正しくありません。管理者にお問い合わせください。";
const PAYMENT_METHODS_DISABLED_MESSAGE =
  "Stripe 決済方法が有効化されていません。管理者にお問い合わせください。";
const PAYMENT_METHODS_INCOMPATIBLE_MESSAGE =
  "選択された決済方法は現在の通貨設定と互換性がありません。管理者にお問い合わせください。";
const CHECKOUT_SESSION_CREATE_FAILED_MESSAGE =
  "決済セッションの作成に失敗しました。しばらく経ってからお試しください。";

export type StripeCheckoutClientContext = {
  readonly client: AsyncOnlyStripe;
  readonly currency: string;
  readonly paymentMethodTypes: StripePaymentMethodType[];
  readonly appUrl: string;
};

export type CheckoutSessionLineItemSpec = {
  readonly name: string;
  readonly unitAmount: number;
  readonly quantity: number;
};

export type CheckoutSessionSpec = {
  readonly lineItems: readonly CheckoutSessionLineItemSpec[];
  readonly metadata: Record<string, string>;
  readonly customerEmail?: string;
  readonly expiresAt: number;
  readonly successUrl: string;
  readonly cancelUrl: string;
  readonly idempotencyKey: string;
};

export type AuthoritativeCheckoutRead<TAuthoritative> =
  | { readonly ok: true; readonly row: TAuthoritative }
  | { readonly ok: false; readonly message: string };

/**
 * Checkout 作成前の Stripe client + payment_method_types 検証。
 * claim より前に呼ぶことで、PENDING に遷移させたまま stuck を残さない。
 */
export async function assertStripeCheckoutClient(): Promise<StripeCheckoutClientContext> {
  const stripeSettings = await assertOnlinePaymentAvailable();
  const { client } = getStripeClient(stripeSettings.stripeSecretKey);
  if (!client) {
    throw new DomainError(STRIPE_MISCONFIGURED_MESSAGE, "VALIDATION");
  }

  const paymentMethodTypes = stripeSettings.stripePaymentMethodTypes.filter(
    isStripePaymentMethodType,
  );
  if (paymentMethodTypes.length === 0) {
    throw new DomainError(PAYMENT_METHODS_DISABLED_MESSAGE, "VALIDATION");
  }

  const incompatibleMethods = findPaymentMethodsIncompatibleWithCurrency(
    paymentMethodTypes,
    stripeSettings.stripeCurrency,
  );
  if (incompatibleMethods.length > 0) {
    throw new DomainError(PAYMENT_METHODS_INCOMPATIBLE_MESSAGE, "VALIDATION");
  }

  return {
    client,
    currency: stripeSettings.stripeCurrency,
    paymentMethodTypes,
    appUrl: getAppUrl(),
  };
}

/**
 * Checkout Session 作成の共有骨格（assert → claim → re-read → create → settle）。
 * line items / URL / metadata / claim where は caller が差し替える。
 */
export async function runCheckoutSessionCreateCommand<
  TRaw,
  TAuthoritative,
  TResult,
>(input: {
  updateMany: PaymentUpdateManyRunner;
  entityId: string;
  extraWhere?: Record<string, unknown>;
  claimWhere: Record<string, unknown>;
  buildClaimData: (claimedAt: Date) => Record<string, unknown>;
  claimConflictMessage: string;
  reRead: () => Promise<TRaw>;
  validateAuthoritative: (
    row: TRaw,
  ) => AuthoritativeCheckoutRead<TAuthoritative>;
  buildSessionSpec: (ctx: {
    currency: string;
    paymentMethodTypes: StripePaymentMethodType[];
    appUrl: string;
    claimedAt: Date;
    authoritative: TAuthoritative;
  }) => CheckoutSessionSpec;
  settleExtraData?: (authoritative: TAuthoritative) => Record<string, unknown>;
  operation: string;
  createFailureOperation: string;
  logContext: Record<string, string>;
  settleConflictMessage: string;
  toResult: (session: { id: string; url: string | null }) => TResult;
}): Promise<TResult> {
  const checkout = await assertStripeCheckoutClient();

  const claimedAt = new Date();
  const claimed = await input.updateMany({
    where: input.claimWhere,
    data: input.buildClaimData(claimedAt),
  });
  if (claimed.count === 0) {
    throw new DomainError(input.claimConflictMessage, "CONFLICT");
  }

  const authoritative = input.validateAuthoritative(await input.reRead());
  if (!authoritative.ok) {
    await revertCheckoutPendingToUnpaid(input.updateMany, {
      entityId: input.entityId,
      ...(input.extraWhere ? { extraWhere: input.extraWhere } : {}),
    });
    throw new DomainError(authoritative.message, "VALIDATION");
  }

  let createdSessionId: string | null = null;

  try {
    const spec = input.buildSessionSpec({
      currency: checkout.currency,
      paymentMethodTypes: checkout.paymentMethodTypes,
      appUrl: checkout.appUrl,
      claimedAt,
      authoritative: authoritative.row,
    });

    const session = await withStripeConnectionHealth(() =>
      checkout.client.checkout.sessions.create(
        {
          mode: "payment",
          payment_method_types: checkout.paymentMethodTypes,
          line_items: spec.lineItems.map((item) => ({
            price_data: {
              currency: checkout.currency,
              product_data: { name: item.name },
              unit_amount: item.unitAmount,
            },
            quantity: item.quantity,
          })),
          metadata: spec.metadata,
          ...(spec.customerEmail !== undefined
            ? { customer_email: spec.customerEmail }
            : {}),
          expires_at: spec.expiresAt,
          success_url: spec.successUrl,
          cancel_url: spec.cancelUrl,
        },
        { idempotencyKey: spec.idempotencyKey },
      ),
    );
    createdSessionId = session.id;

    const extraData = input.settleExtraData?.(authoritative.row);
    const { settled } = await settleCheckoutSessionWrite(input.updateMany, {
      entityId: input.entityId,
      sessionId: session.id,
      ...(input.extraWhere ? { extraWhere: input.extraWhere } : {}),
      ...(extraData !== undefined ? { extraData } : {}),
    });
    if (!settled) {
      await rejectCheckoutSessionSettle({
        client: checkout.client,
        sessionId: session.id,
        operation: input.operation,
        logContext: input.logContext,
        conflictMessage: input.settleConflictMessage,
      });
    }

    return input.toResult(session);
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: {
        operation: input.createFailureOperation,
        ...input.logContext,
      },
    });
    await handleCheckoutSessionCreateFailure({
      createdSessionId,
      expireOpenCheckoutSessionBestEffort,
      revertPending: () =>
        revertCheckoutPendingToUnpaid(input.updateMany, {
          entityId: input.entityId,
          ...(input.extraWhere ? { extraWhere: input.extraWhere } : {}),
        }),
      expireContext: input.logContext,
    });
    throw new DomainError(CHECKOUT_SESSION_CREATE_FAILED_MESSAGE, "UNEXPECTED");
  }
}
