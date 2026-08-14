/**
 * Marketing List-Unsubscribe（RFC 8058 one-click）
 *
 * - POST: 実際に配信停止する唯一の経路。Gmail/Yahoo の one-click
 *   （`List-Unsubscribe=One-Click`、token は query）と、下の確認ページの
 *   `<form method="POST">`（token は body）の両方を受ける。
 * - GET: **副作用ゼロ**。token を read-only で検証し、確認ページを返すだけ。
 *
 * ## GET を副作用ゼロにしている理由 (HTTP-02)
 *
 * このリンクはメール本文に入る。Outlook SafeLinks / Gmail のリンクプリフェッチ /
 * Slack unfurl / iMessage プレビューが GET で取得した時点で配信停止が実行されると、
 * **顧客は一度もクリックしていないのに opt-out される**。token の TTL は 90 日なので
 * 同じメールが後日スキャンされても同様に発火する。User 未リンクのゲスト顧客は
 * マイページを持たないため自力で戻せない（監査 F-40）。
 *
 * RFC 9110 の safe-method 契約により、link scanner は unsafe method (POST) を
 * プリフェッチしない。同じ理由で `api/receipts/[serialNo]/pdf` と
 * `api/customer/verify-email` は既に 2-step になっており、この route だけが漏れていた。
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

function tokenFromQuery(request: Request): string | null {
  const url = new URL(request.url);
  const fromQuery = url.searchParams.get("token");
  if (fromQuery && fromQuery.length > 0) return fromQuery;
  return null;
}

/**
 * POST の token。one-click は query に載せ、確認ページの form は body に載せる。
 * body の parse に失敗しても query 側で解決できるよう握りつぶす。
 */
async function tokenFromRequest(request: Request): Promise<string | null> {
  const fromQuery = tokenFromQuery(request);
  if (fromQuery) return fromQuery;

  try {
    const form = await request.formData();
    const fromBody = form.get("token");
    if (typeof fromBody === "string" && fromBody.length > 0) return fromBody;
  } catch {
    // one-click の body は `List-Unsubscribe=One-Click` か空。parse 失敗は想定内。
  }
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

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function page(title: string, bodyHtml: string): Response {
  const html = `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="robots" content="noindex" />
  <title>${title}</title>
  <style>
    body { font-family: system-ui, sans-serif; line-height: 1.6; max-width: 36rem; margin: 3rem auto; padding: 0 1.25rem; color: #1a1a1a; }
    h1 { font-size: 1.25rem; margin-bottom: 1rem; }
    p { font-size: 0.95rem; color: #333; }
    a { color: #0b5fff; }
    button { font: inherit; padding: 0.6rem 1.2rem; border: 1px solid #0b5fff; background: #0b5fff; color: #fff; border-radius: 0.25rem; cursor: pointer; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${bodyHtml}
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

/** GET が返す確認ページ。ここでは配信停止しない。ボタン (POST) で実行する。 */
function confirmPage(token: string): Response {
  return page(
    "お知らせメールの配信を停止しますか？",
    `<p>下のボタンを押すと、運営からのお知らせ・キャンペーンメールの配信を停止します。予約確認などの重要なお知らせは引き続き届く場合があります。</p>
  <form method="POST" action="/api/email/unsubscribe">
    <input type="hidden" name="token" value="${escapeHtml(token)}" />
    <button type="submit">配信を停止する</button>
  </form>`,
  );
}

function completedPage(): Response {
  return page(
    "お知らせメールの配信を停止しました",
    `<p>今後、運営からのお知らせ・キャンペーンメールは配信されません。予約確認などの重要なお知らせは引き続き届く場合があります。<br />設定はマイページのアカウント設定からいつでも変更できます。</p>`,
  );
}

function invalidPage(): Response {
  return page(
    "リンクが無効か有効期限が切れています",
    `<p>この配信停止リンクは無効か、有効期限が切れています。マイページにログインして「お知らせメール」の設定をご確認ください。</p>`,
  );
}

/**
 * 配信停止を実行する唯一の経路。
 *
 * - one-click（`List-Unsubscribe=One-Click`）: token は query。空 body で 200 を返す。
 * - 確認ページの form: token は body。人間が見る画面なので完了ページを返す。
 *
 * 見分けは `Accept` ではなく **body に token があるか**で行う。one-click の
 * User-Agent は当てにならない。
 */
export async function POST(request: Request) {
  const fromQueryOnly = tokenFromQuery(request);
  try {
    const token = await tokenFromRequest(request);
    const result = await processUnsubscribe(token);

    // one-click（token が query 由来）は RFC 8058 どおり空 body の 200。
    if (fromQueryOnly !== null) return new Response(null, { status: 200 });

    return result === "ok" ? completedPage() : invalidPage();
  } catch (error) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "marketingUnsubscribePost" },
    });
    // クライアント側に失敗を見せず 200（再試行ストーム防止）
    if (fromQueryOnly !== null) return new Response(null, { status: 200 });
    return invalidPage();
  }
}

/**
 * **副作用ゼロ。** token を read-only で検証し、確認ページを返すだけ。
 * link scanner のプリフェッチで opt-out されないようにするための分離（HTTP-02）。
 */
export function GET(request: Request): Response {
  try {
    const token = tokenFromQuery(request);
    if (!token) return invalidPage();
    if (!verifyMarketingUnsubscribeToken(token)) return invalidPage();
    return confirmPage(token);
  } catch (error) {
    unstable_rethrow(error);
    logError(normalizeError(error), {
      category: ErrorCategory.UNKNOWN,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "marketingUnsubscribeGet" },
    });
    return invalidPage();
  }
}
