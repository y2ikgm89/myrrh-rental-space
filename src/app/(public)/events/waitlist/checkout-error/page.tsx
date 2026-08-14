import type { ReactElement } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import type { SearchParams } from "nuqs/server";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { getBusinessInfo } from "@/public/data/business";
import { requireFeatureEnabled } from "@/shared/domain/features/check";
import {
  WAITLIST_CHECKOUT_ISSUE_REASONS,
  type WaitlistCheckoutIssueReason,
} from "@/shared/domain/events/classify-waitlist-offer-checkout-error";

// トークンゲート系ページの兄弟（expired/confirm と同方針）。検索結果に出さない。
export const metadata: Metadata = {
  title: "繰り上げ当選のお支払いについて",
  robots: { index: false, follow: false },
};

const CHECKOUT_ISSUE_REASON_SET = new Set<string>(
  WAITLIST_CHECKOUT_ISSUE_REASONS,
);

function isCheckoutIssueReason(
  value: unknown,
): value is WaitlistCheckoutIssueReason {
  return typeof value === "string" && CHECKOUT_ISSUE_REASON_SET.has(value);
}

function checkoutErrorCopy(reason: WaitlistCheckoutIssueReason): {
  heading: string;
  message: string;
} {
  switch (reason) {
    case "conflict":
      return {
        heading: "お支払い手続きを確認しています",
        message:
          "この繰り上げ当選のお支払い手続きは、別のタブまたはウィンドウで既に開始されている可能性があります。そちらの画面で決済を完了してください。",
      };
    case "too-late":
      return {
        heading: "お支払いを開始できません",
        message:
          "確定期限までの残り時間が短いため、決済を開始できません。まもなく期限切れとなり、次の待機者へ繰り上がります。",
      };
    case "system":
      return {
        heading: "エラーが発生しました",
        message:
          "お支払い手続きの開始中に問題が発生しました。招待の有効期限が切れたわけではありません。時間をおいて改めてお試しいただくか、お手数ですが下記までお問い合わせください。",
      };
    default: {
      const _exhaustive: never = reason;
      return _exhaustive;
    }
  }
}

interface PageProps {
  readonly searchParams: Promise<SearchParams>;
}

/**
 * イベント waitlist 繰り上げ当選（有料チケット）の Stripe Checkout 起動に
 * 失敗したときのソフトランディング。
 *
 * `checkout/[token]/route.ts` が `createWaitlistOfferCheckoutSessionCommand` の
 * `DomainError` を「genuine expiry」（token 不正 / NOT_FOUND / 確定待ちでない
 * VALIDATION）と区別できず全部 `/expired` に丸めていた問題（final review I2）の
 * 着地先を 2 つに分ける:
 *
 *   - `reason=conflict`: `DomainError(code: "CONFLICT")`。既に別のタブ/
 *     ウィンドウで決済処理が claim 済み（例: 同じメールのリンクを 2 か所で開いた）。
 *     「期限切れ」ではなく「進行中」であることを伝える。
 *   - `reason=too-late`: 確定期限の残りが Stripe Checkout の 30 分下限未満。
 *     期限切れ画面には送らず、まもなく次の待機者へ繰り上がることを伝える。
 *   - `reason=system`（既定値・fallback）: Stripe 未設定・支払方法未有効化・
 *     チケット価格欠落・Stripe API 呼出自体の失敗など、運営側の設定不備や
 *     インフラ障害。顧客の操作や招待の有効期限とは無関係であることを伝え、
 *     問い合わせ先を示す（サーバー側は route.ts 側で `logError` の CRITICAL に
 *     より可視化済み。ここでは表示のみを担う）。
 *
 * `expired/page.tsx` と同じく token 自体は扱わず DB アクセスも無いため、
 * rate limit は不要（`confirm/page.tsx` が rate limit を持つのは token ごとに
 * 未キャッシュの `findFirst` を叩くため — このページには該当しない）。
 */
export default async function WaitlistCheckoutErrorPage({
  searchParams,
}: PageProps): Promise<ReactElement> {
  await connection();
  await requireFeatureEnabled("events");

  const sp = await searchParams;
  const rawReason = sp["reason"];
  const reason: WaitlistCheckoutIssueReason = isCheckoutIssueReason(rawReason)
    ? rawReason
    : "system";

  const { email: contactEmail } = await getBusinessInfo();

  const copy = checkoutErrorCopy(reason);

  return (
    <PageLayout variant="form">
      <Stack gap="lg" className="mx-auto max-w-2xl">
        <Heading level={1}>{copy.heading}</Heading>
        <div className="border border-border p-6 text-center">
          <p className="text-base font-medium text-foreground">
            {copy.message}
          </p>
          {contactEmail && (
            <p className="mt-4 text-sm">
              お問い合わせは
              <a
                href={`mailto:${contactEmail}`}
                className="underline underline-offset-4 hover:text-foreground"
              >
                {contactEmail}
              </a>
              までご連絡ください。
            </p>
          )}
          <p className="mt-6 text-sm">
            <Link
              href="/events"
              className="underline underline-offset-4 hover:text-foreground"
            >
              イベント一覧を見る
            </Link>
          </p>
        </div>
      </Stack>
    </PageLayout>
  );
}
