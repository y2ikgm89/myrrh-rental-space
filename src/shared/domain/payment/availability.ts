import "server-only";

import { DomainError } from "@/shared/domain/domain-error";
import { getStripeSettings } from "@/shared/domain/settings/queries/integration";
import { isFeatureEnabled } from "@/shared/lib/features/check";

/**
 * オンライン決済（Stripe）が「業務判断」と「技術状態」の両面で使える状態かを判定する
 * ドメイン層の単一 gate。
 *
 * ## 二層分離（Shopify shop.features / Stripe Capabilities 相当）
 *
 * - **業務層** — `isFeatureEnabled("payment")`: 運営者が「オンライン決済機能を提供する」と
 *   宣言しているか。`Settings.featureModules.payment` が SSoT。`requires: ["reservation"]`
 *   のため reservation OFF で自動 OFF される（feature module registry の cascade）。
 * - **技術層** — Stripe credentials: `stripeSecretKey` と `stripeWebhookSecret` の
 *   両方が保存されているか。どちらも webhook 経由の状態遷移に必須のため、
 *   片方欠損の状態で checkout を通してしまうと支払い後に paymentStatus が更新できず
 *   silent orphan（会計 mismatch）になる。
 *
 * ## 戻り値
 *
 * 両条件成立 → `StripeCredentials`（credentials を含む object）を返す。呼び出し側は
 * これをそのまま `getStripeClient(...)` に渡せる。
 *
 * どちらか失敗 → `DomainError("VALIDATION")` を throw。理由は message に含めるが、
 * 業務 OFF と設定不備は同じ状況ではないため message を分ける（顧客への表示・admin の
 * 切り分けを容易にする）。
 *
 * ## 使い所
 *
 * 予約・イベントの checkout session 作成 / 返金コマンド / Stripe webhook の受信で
 * 必ず先頭に呼ぶ。UI 側の「決済ボタンを出すか」判定は `isFeatureEnabled("payment")` を
 * 直接使い、credentials 状態には触れない（credentials 欠損は運用エラーとして DomainError で
 * 拾い、UI では出し分けない）。
 */
export interface StripeCredentials {
  readonly stripeSecretKey: string;
  readonly stripeWebhookSecret: string;
  readonly stripePublishableKey: string | null;
  readonly stripeAccountId: string | null;
  readonly stripeCurrency: string;
  readonly stripePaymentMethodTypes: readonly string[];
}

export async function assertOnlinePaymentAvailable(): Promise<StripeCredentials> {
  if (!(await isFeatureEnabled("payment"))) {
    throw new DomainError(
      "オンライン決済機能が無効になっています",
      "VALIDATION",
    );
  }

  const settings = await getStripeSettings();
  if (!settings?.stripeSecretKey || !settings.stripeWebhookSecret) {
    throw new DomainError(
      "Stripe の設定が正しくありません。管理者にお問い合わせください。",
      "VALIDATION",
    );
  }

  return {
    stripeSecretKey: settings.stripeSecretKey,
    stripeWebhookSecret: settings.stripeWebhookSecret,
    stripePublishableKey: settings.stripePublishableKey ?? null,
    stripeAccountId: settings.stripeAccountId ?? null,
    stripeCurrency: settings.stripeCurrency ?? "jpy",
    stripePaymentMethodTypes: settings.stripePaymentMethodTypes,
  };
}
