import { claimReceiptForSingleUseTokenDownload } from "@/shared/domain/receipts/download";
import { findReceiptForDownload } from "@/shared/domain/receipts/queries";
import { getCustomerSession } from "@/shared/lib/customer-auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { assertCustomerActive } from "@/shared/domain/customers/guard";
import { DomainError } from "@/shared/domain/domain-error";
import { renderReceiptPdf } from "@/shared/pdf/render-receipt-pdf";
import { verifyReceiptDownloadToken } from "@/shared/lib/receipt-download-token";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import { fireAndForget } from "@/shared/lib/async-utils";
import { buildAuditRequestContext } from "@/shared/lib/audit-request-context";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { AuditAction } from "@/shared/lib/validations/enums/prisma-types";
import { receiptDownloadBySerialNoRateLimiter } from "@/shared/lib/rate-limit";

/**
 * 領収書 PDF ダウンロード Route Handler.
 *
 * ## URL
 * - `GET  /api/receipts/[serialNo]/pdf` — **Better Auth session 経路専用** (mypage)
 * - `POST /api/receipts/[serialNo]/pdf` — **ゲスト署名トークン経路専用**。
 *   `application/x-www-form-urlencoded` の body に `token=<signed>` を含める。
 *
 * ## 経路の分割理由 (HTTP-02)
 * 旧: 単一 GET が `?token=<sig>` を受け取り、Route Handler 側で claim + PDF 返却。
 * 問題: Outlook SafeLinks / Gmail preview / Slack unfurl / iMessage / Discord embed 等の
 * link scanner がメール内リンクを GET プリフェッチし、単発トークンの `usedAt` が
 * 消費されてしまう。ゲストが本物のクリックをしたときには 404。
 *
 * 対策: RFC 9110 の safe-method 契約により、link scanner は **unsafe method (POST)** を
 * プリフェッチしない (副作用を伴う可能性を認識してスキップする)。ゲスト経路の
 * token claim を POST に移し、GET は session 経路 (副作用ゼロ) のみを受け付ける。
 * ユーザーはメール内リンクから `/receipts/[serialNo]/download?token=...` 確認ページに
 * 遷移し、そこの「領収書 PDF をダウンロードする」ボタン (`<form method="POST">`) で
 * 本 Route Handler の POST を叩く 2-step flow に変わる。
 *
 * ## Ownership 検証 (経路ごとに完全分離)
 * - **GET** は Better Auth session のみを受け付ける。session の customer.id と
 *   Receipt.reservation.customerId / eventRegistration.customerId を突合し、
 *   `assertCustomerActive` で Customer.isActive + status !== BLACKLIST を検証する
 *   (CRITIC-2)。session cookie が有効でも管理側停止 / BLACKLIST に落ちた顧客は
 *   領収書 (適格請求書 = 課税事業者情報を含む文書) を DL できない (403)。
 * - **POST** は body の `token` を `verifyReceiptDownloadToken` で検証する。トークン
 *   内 serialNo と URL の serialNo を突合。session は参照しない (ゲスト前提)。
 *   有効期限 24 時間 (RECEIPT-USEDAT-P1)、single-use gate は
 *   `claimReceiptForSingleUseTokenDownload` (advisory-lock tx) 内で「`usedAt IS NULL`
 *   確認 → PDF レンダリング → `usedAt = now` 刻印」の 3 op を atomically 実行する。
 *   既に消費済み・別 tx が保有中なら 404、render 失敗なら tx が roll back して
 *   `usedAt` は NULL のまま (次回リトライ可)。
 *
 * どちらも該当しなければ 404 (存在自体を隠蔽して brute force 探索を防ぐ)。
 *
 * ## Response
 * - Content-Type: application/pdf
 * - Content-Disposition: attachment; filename=receipt-<serialNo>.pdf
 * - Cache-Control: private, no-store (next.config.ts の headers() が更に強制するが二重防御)
 *
 * ## Method allowlist (HTTP-01)
 * Next.js 16 App Router は `HEAD` handler 未定義 + `GET` 定義済みの場合、HEAD 要求を
 * 内部的に GET へ auto-fallback する。そのまま放置すると `HEAD /api/receipts/YYYY-NNNNNN/pdf?token=<sig>`
 * だけで `claimReceiptForSingleUseTokenDownload` が実行され `usedAt` が消費される
 * (レスポンス body は捨てられるが DB 副作用が残り、正規顧客の DL が `already_used` で 404 になる)。
 * これを防ぐため HEAD / OPTIONS は明示的に 405 で reject し、Allow ヘッダで GET のみを告知する。
 *
 * ## Per-serialNo rate limit (HTTP-03)
 * proxy.ts の checkRateLimit は汎用 apiRateLimiter (100/min/IP) のみで、同一 serialNo への
 * brute-force / usedAt 焼き潰し DoS が抜ける。`cancelByReservationRateLimiter` と同型の
 * 「resource (serialNo) 単位の第二防壁」として 10 attempts/hour/serialNo を追加する。
 * 429 は本文最小 (存在隠蔽) で返す。
 *
 * ## 未使用の Route segment config
 * cacheComponents:true との整合上、`export const dynamic` 等の segment config は禁止
 * (architecture-boundaries.test.ts の 0 件強制)。Route Handler は default dynamic のため
 * 明示 config は不要。
 */
export async function HEAD(): Promise<Response> {
  // HTTP-01: Next.js 16 の GET auto-fallback を封殺。HEAD が GET へフォールバックすると
  // usedAt が silent に消費されるため、明示的に 405 を返す。
  return new Response(null, { status: 405, headers: { Allow: "GET" } });
}

export async function OPTIONS(): Promise<Response> {
  // HTTP-01 と同型。CORS preflight を許容しない (same-origin only) 明示。
  return new Response(null, { status: 405, headers: { Allow: "GET" } });
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ serialNo: string }> },
): Promise<Response> {
  const { serialNo } = await params;

  // HTTP-03: per-serialNo rate limit (10/hour)。findReceiptForDownload (DB read) より
  // 先に in-memory bucket でカットオフし、brute-force 探索 × usedAt 焼き潰しの単価を下げる。
  const rateLimit = await receiptDownloadBySerialNoRateLimiter.check(serialNo);
  if (!rateLimit.success) {
    return new Response("Too many requests", { status: 429 });
  }

  const receipt = await findReceiptForDownload(serialNo);
  if (!receipt) {
    return new Response("Not found", { status: 404 });
  }

  // Better Auth session 経路のみ (トークンは POST に移行済み — HTTP-02)。
  const session = await getCustomerSession();
  if (!session) {
    return new Response("Not found", { status: 404 });
  }

  const customer = await getCustomerByUserId(session.user.id);
  const ownerId =
    receipt.reservation?.customerId ??
    receipt.eventRegistration?.customerId ??
    null;
  if (!customer || ownerId === null || ownerId !== customer.id) {
    return new Response("Not found", { status: 404 });
  }

  // CRITIC-2: session cookie + ownership が揃っていても、
  // Customer.isActive === false (管理側停止) or status === BLACKLIST の
  // 顧客は領収書 (適格請求書) を DL できない。MypageAuthGate が UI で
  // 遮断するのと同じセマンティクスを、並行して露出しているこの
  // Route Handler でも強制する。session 有効なので 401 ではなく 403。
  try {
    await assertCustomerActive(customer.id);
  } catch (error) {
    if (error instanceof DomainError && error.code === "FORBIDDEN") {
      return new Response("Forbidden", { status: 403 });
    }
    // NOT_FOUND (customer が消えた TOCTOU) や他 DomainError は
    // 下段の 404 (存在隠蔽) にそのまま fall-through する
    if (!(error instanceof DomainError)) {
      throw error;
    }
    return new Response("Not found", { status: 404 });
  }

  return renderSessionPdf(receipt);
}

/**
 * ゲスト署名 URL 経路の POST endpoint (HTTP-02)。
 *
 * `application/x-www-form-urlencoded` の body に `token=<signed>` を含めて POST する。
 * body から取得することで:
 * 1. link scanner が URL クエリ経由の GET プリフェッチで token を露出できない
 * 2. Referer / access log に token が残らない
 * 3. RFC 9110 の safe-method 契約により link scanner が POST を実行しない
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ serialNo: string }> },
): Promise<Response> {
  const { serialNo } = await params;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const tokenValue = formData.get("token");
  const token = typeof tokenValue === "string" ? tokenValue : null;
  if (!token) {
    return new Response("Not found", { status: 404 });
  }

  const verified = verifyReceiptDownloadToken(token, new Date());
  if (!verified.valid || verified.serialNo !== serialNo) {
    return new Response("Not found", { status: 404 });
  }

  const receipt = await findReceiptForDownload(serialNo);
  if (!receipt) {
    return new Response("Not found", { status: 404 });
  }

  const renderInput = buildRenderInput(receipt);

  try {
    const claim = await claimReceiptForSingleUseTokenDownload(
      receipt.id,
      renderInput,
    );
    if (claim.status === "already_used") {
      return new Response("Not found", { status: 404 });
    }

    // 成功: PDF DL を AuditLog に append (fire-and-forget、chain tx は別接続)。
    // 失敗時は audit-log 側 logger に記録済みで DL 応答は返る。metadata の
    // 汎用 redaction は audit-log/commands.ts の redactSensitiveAuditJson が担う。
    const auditPromise = (async () => {
      const { ip, userAgent } = await buildAuditRequestContext();
      await createAuditLogRecord({
        action: AuditAction.UPDATE,
        resource: "receipt",
        resourceId: receipt.id,
        metadata: {
          path: "token",
          serialNo: receipt.serialNo,
          ...(ip !== null && { ip }),
          ...(userAgent !== null && { userAgent }),
        },
      });
    })();
    fireAndForget(auditPromise, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      operation: "receiptPdfDownloadAuditLog",
      context: { serialNo: receipt.serialNo, path: "token" },
    });

    return buildPdfResponse(claim.pdfBuffer, receipt.serialNo);
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: {
        operation: "receiptPdfDownload",
        path: "token",
        serialNo: receipt.serialNo,
      },
    });
    return new Response("Failed to generate receipt PDF", { status: 500 });
  }
}

type ReceiptForDownload = NonNullable<
  Awaited<ReturnType<typeof findReceiptForDownload>>
>;

/**
 * Prisma の Decimal 列 (amount / taxAmount / taxRate) を number に変換する。
 * Reservation / EventRegistration は `$extends` で自動変換されるが、Receipt は
 * 現在 `$extends` 対象外のため呼出側で Number() する (receipt-full-wiring PR#7 で
 * $extends 拡張時に除去可能)。
 */
function buildRenderInput(receipt: ReceiptForDownload) {
  return {
    serialNo: receipt.serialNo,
    issuedAt: receipt.issuedAt,
    recipientName: receipt.recipientName,
    subject: receipt.subject,
    amount: Number(receipt.amount),
    taxAmount: Number(receipt.taxAmount),
    taxRate: Number(receipt.taxRate),
    issuerSnapshot: receipt.issuerSnapshot,
  };
}

async function renderSessionPdf(
  receipt: ReceiptForDownload,
): Promise<Response> {
  try {
    const buffer = await renderReceiptPdf(buildRenderInput(receipt));
    return buildPdfResponse(buffer, receipt.serialNo);
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: {
        operation: "receiptPdfDownload",
        path: "session",
        serialNo: receipt.serialNo,
      },
    });
    return new Response("Failed to generate receipt PDF", { status: 500 });
  }
}

function buildPdfResponse(buffer: Buffer, serialNo: string): Response {
  // Node.js Buffer を Web Response の BodyInit に渡すため Uint8Array 化。
  // Buffer は Uint8Array のサブクラスだが TypeScript の Response 型が Node.js Buffer を
  // 直接受け付けないため明示変換する (公式推奨パターン)。
  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename=receipt-${serialNo}.pdf`,
      "Cache-Control": "private, no-store",
    },
  });
}
