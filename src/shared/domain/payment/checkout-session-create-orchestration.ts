import "server-only";

import type Stripe from "stripe";
import { DomainError } from "@/shared/domain/domain-error";
import { assertOnlinePaymentAvailable } from "@/shared/domain/payment/availability";
import { expireOpenCheckoutSessionBestEffort } from "@/shared/domain/payment/checkout-session-expiry";
import {
  handleCheckoutSessionCreateFailure,
  rejectCheckoutSessionSettle,
  revertCheckoutPendingToUnpaid,
  type PaymentUpdateManyRunner,
} from "@/shared/domain/payment/checkout-session-write-orchestration";
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
} from "@/shared/lib/stripe-payment-methods";

export type CheckoutStripeContext = {
  client: AsyncOnlyStripe;
  currency: string;
  paymentMethodTypes: Stripe.Checkout.SessionCreateParams.PaymentMethodType[];
  appUrl: string;
};

/** 新規 Checkout Session 作成前の Stripe client / 決済方法 / 通貨 gate。 */
export async function resolveCheckoutStripeContext(): Promise<CheckoutStripeContext> {
  const stripeSettings = await assertOnlinePaymentAvailable();
  const { client } = await getStripeClient(stripeSettings.stripeSecretKey);
  if (!client) {
    throw new DomainError(
      "Stripe の設定が正しくありません。管理者にお問い合わせください。",
      "VALIDATION",
    );
  }

  const paymentMethodTypes = stripeSettings.stripePaymentMethodTypes.filter(
    isStripePaymentMethodType,
  );
  if (paymentMethodTypes.length === 0) {
    throw new DomainError(
      "Stripe 決済方法が有効化されていません。管理者にお問い合わせください。",
      "VALIDATION",
    );
  }

  const incompatibleMethods = findPaymentMethodsIncompatibleWithCurrency(
    paymentMethodTypes,
    stripeSettings.stripeCurrency,
  );
  if (incompatibleMethods.length > 0) {
    throw new DomainError(
      "選択された決済方法は現在の通貨設定と互換性がありません。管理者にお問い合わせください。",
      "VALIDATION",
    );
  }

  return {
    client,
    currency: stripeSettings.stripeCurrency,
    paymentMethodTypes,
    appUrl: getAppUrl(),
  };
}

export type CheckoutSessionCreateOrchestrationInput<TResult> = {
  operation: string;
  idempotencyKey: string;
  stripeContext: CheckoutStripeContext;
  buildSessionParams: () => Stripe.Checkout.SessionCreateParams;
  settleSession: (sessionId: string) => Promise<{ settled: boolean }>;
  revertPending: () => Promise<void>;
  conflictMessage: string;
  expireContext: Record<string, string>;
  buildSuccessResult: (session: { id: string; url: string }) => TResult;
};

/**
 * claim-first 後の Stripe Checkout Session 作成 + settle + 失敗時 cleanup。
 * Stripe API は advisory lock / interactive tx の外で呼ぶ（checkout create の既存契約）。
 */
export async function orchestrateCheckoutSessionCreate<TResult>(
  input: CheckoutSessionCreateOrchestrationInput<TResult>,
): Promise<TResult> {
  let createdSessionId: string | null = null;
  const { client } = input.stripeContext;

  try {
    const session = await client.checkout.sessions.create(
      input.buildSessionParams(),
      { idempotencyKey: input.idempotencyKey },
    );
    createdSessionId = session.id;

    const { settled } = await input.settleSession(session.id);
    if (!settled) {
      await rejectCheckoutSessionSettle({
        client,
        sessionId: session.id,
        operation: input.operation,
        logContext: input.expireContext,
        conflictMessage: input.conflictMessage,
      });
    }

    if (!session.url) {
      throw new DomainError(
        "決済セッションの作成に失敗しました。しばらく経ってからお試しください。",
        "UNEXPECTED",
      );
    }

    return input.buildSuccessResult({ id: session.id, url: session.url });
  } catch (error) {
    if (error instanceof DomainError) {
      throw error;
    }
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: {
        operation: input.operation,
        ...input.expireContext,
      },
    });
    await handleCheckoutSessionCreateFailure({
      createdSessionId,
      expireOpenCheckoutSessionBestEffort,
      revertPending: input.revertPending,
      expireContext: input.expireContext,
    });
    throw new DomainError(
      "決済セッションの作成に失敗しました。しばらく経ってからお試しください。",
      "UNEXPECTED",
    );
  }
}

/** entity payment-commands 向け revert adapter。 */
export function buildRevertCheckoutPendingAdapter(
  updateMany: PaymentUpdateManyRunner,
  entityId: string,
  extraWhere?: Record<string, unknown>,
): () => Promise<void> {
  return () => {
    const revertInput: {
      entityId: string;
      extraWhere?: Record<string, unknown>;
    } = { entityId };
    if (extraWhere !== undefined) {
      revertInput.extraWhere = extraWhere;
    }
    return revertCheckoutPendingToUnpaid(updateMany, revertInput);
  };
}
