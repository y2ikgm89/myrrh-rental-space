/**
 * Marketing List-Unsubscribe（RFC 8058 one-click）
 *
 * - POST: Gmail/Yahoo の one-click（`List-Unsubscribe=One-Click`）。空 body で 200。
 * - GET: メール本文リンク / 手動アクセス用の確認 HTML。
 *
 * トークン不正・期限切れ・未知 customer でも 200 系で ack し、
 * 存在確認の oracle にならないようにする（副作用が無い場合も成功表示）。
 *
 * @see https://resend.com/docs/dashboard/emails/add-unsubscribe-to-transactional-emails
 * @see https://www.rfc-editor.org/rfc/rfc8058
 * @module api/email/unsubscribe
 */

import { unstable_rethrow } from "next/navigation";
import { optOutCustomerMarketingById } from "@/shared/domain/customers/commands";
import { verifyMarketingUnsubscribeToken } from "@/shared/lib/tokens/marketing-unsubscribe-token";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";

function extractToken(request: Request): string | null {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("token");
  if (fromQuery && fromQuery.length > 0) return fromQuery;
  return null;
}

async function processUnsubscribe(
  token: string | null,
): Promise<"ok" | "invalid"> {
  if (!token) return "invalid";
  const verified = verifyMarketingUnsubscribeToken(token);
  if (!verified) return "invalid";

  await optOutCustomerMarketingById(verified.customerId);
  return "ok";
}

function confirmationHtml(kind: "ok" | "invalid"): Response {
  const title =
    kind === "ok"
      ? "お知らせメールの配信を停止しました"
      : "リンクが無効か有効期限が切れています";
  const body =
    kind === "ok"
      ? "今後、運営からのお知らせ・キャンペーンメールは配信されません。予約確認などの重要なお知らせは引き続き届く場合があります。<br />設定はマイページのアカウント設定からいつでも変更できます。"
      : "この配信停止リンクは無効か、有効期限が切れています。マイページにログインして「お知らせメール」の設定をご確認ください。";

  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title}</title>
  <style>
    body { font-family: system-ui, sans-serif; line-height: 1.6; max-width: 36rem; margin: 3rem auto; padding: 0 1.25rem; color: #1a1a1a; }
    h1 { font-size: 1.25rem; margin-bottom: 1rem; }
    p { font-size: 0.95rem; color: #333; }
    a { color: #0b5fff; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  <p>${body}</p>
  <p><a href="/mypage/settings">マイページの設定へ</a></p>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(request: Request) {
  try {
    // one-click は常に 200（RFC 8058 / Gmail: 失敗でも再送ループを避ける）
    await processUnsubscribe(extractToken(request));
    return new Response(null, { status: 200 });
  } catch (error) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "marketingUnsubscribePost" },
    });
    // クライアント側に失敗を見せず 200（再試行ストーム防止）
    return new Response(null, { status: 200 });
  }
}

export async function GET(request: Request) {
  try {
    const result = await processUnsubscribe(extractToken(request));
    return confirmationHtml(result);
  } catch (error) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "marketingUnsubscribeGet" },
    });
    return confirmationHtml("invalid");
  }
}
