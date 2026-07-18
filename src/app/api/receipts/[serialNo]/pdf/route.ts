import { claimReceiptForSingleUseTokenDownload } from "@/shared/domain/receipts/download";
import { findReceiptForDownload } from "@/shared/domain/receipts/queries";
import { getCustomerSession } from "@/shared/lib/customer-auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
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

/**
 * 領収書 PDF ダウンロード Route Handler.
 *
 * ## URL
 * GET /api/receipts/[serialNo]/pdf[?token=<signed>]
 *
 * ## Ownership 検証 (二経路 OR)
 * 1. **署名 URL (`?token=`)** — メール本文のリンク経由 (ゲスト予約 = customerId null の
 *    場合に必須)。verifyReceiptDownloadToken でトークン内 serialNo と URL の serialNo を
 *    突合。有効期限 24 時間 (RECEIPT-USEDAT-P1)。
 * 2. **Better Auth session** — 認証済み顧客が mypage から DL する場合。session の
 *    customer.id と Receipt.reservation.customerId / eventRegistration.customerId を突合。
 *
 * どちらも該当しなければ 404 (存在自体を隠蔽して brute force 探索を防ぐ)。
 *
 * ## Single-use gate (RECEIPT-USEDAT-P1)
 * **token 経路のみ**、`claimReceiptForSingleUseTokenDownload` (advisory-lock tx) 内で
 * 「`usedAt IS NULL` 確認 → PDF レンダリング → `usedAt = now` 刻印」の 3 op を
 * atomically 実行する。既に消費済み・別 tx が保有中なら 404、render 失敗なら tx が
 * roll back して `usedAt` は NULL のまま (次回リトライ可)。
 *
 * Better Auth session 経路 (mypage) は本 gate を通らず無制限 DL 可 (会員は決済履歴の
 * 一部として自分の領収書に無制限アクセスするビジネス要求)。
 *
 * ## Response
 * - Content-Type: application/pdf
 * - Content-Disposition: attachment; filename=receipt-<serialNo>.pdf
 * - Cache-Control: private, no-store (次 config.ts の headers() が更に強制するが二重防御)
 *
 * ## 未使用の Route segment config
 * cacheComponents:true との整合上、`export const dynamic` 等の segment config は禁止
 * (architecture-boundaries.test.ts の 0 件強制)。Route Handler は default dynamic のため
 * 明示 config は不要。
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ serialNo: string }> },
): Promise<Response> {
  const { serialNo } = await params;

  const receipt = await findReceiptForDownload(serialNo);
  if (!receipt) {
    return new Response("Not found", { status: 404 });
  }

  // Ownership 検証 (OR): 署名 URL → Better Auth session
  const token = new URL(request.url).searchParams.get("token");
  let tokenValid = false;

  if (token) {
    const result = verifyReceiptDownloadToken(token, new Date());
    if (result.valid && result.serialNo === serialNo) {
      tokenValid = true;
    }
  }

  let sessionAuthorized = false;
  if (!tokenValid) {
    const session = await getCustomerSession();
    if (session) {
      const customer = await getCustomerByUserId(session.user.id);
      const ownerId =
        receipt.reservation?.customerId ??
        receipt.eventRegistration?.customerId ??
        null;
      if (customer && ownerId !== null && ownerId === customer.id) {
        sessionAuthorized = true;
      }
    }
  }

  if (!tokenValid && !sessionAuthorized) {
    // 存在自体を隠蔽 (brute-force 探索対策)
    return new Response("Not found", { status: 404 });
  }

  // Prisma の Decimal 列 (amount / taxAmount / taxRate) を number に変換。
  // Reservation / EventRegistration は $extends で自動変換されるが、Receipt は
  // 現在 $extends 対象外のため呼出側で Number() する (receipt-full-wiring PR#7 で
  // $extends 拡張時に除去可能)。
  const renderInput = {
    serialNo: receipt.serialNo,
    issuedAt: receipt.issuedAt,
    recipientName: receipt.recipientName,
    subject: receipt.subject,
    amount: Number(receipt.amount),
    taxAmount: Number(receipt.taxAmount),
    taxRate: Number(receipt.taxRate),
    issuerSnapshot: receipt.issuerSnapshot,
  };

  if (tokenValid) {
    // ==============================
    // Token path: single-use gate
    // ==============================
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

  // ==============================
  // Session path (mypage): 無制限 DL
  // ==============================
  try {
    const buffer = await renderReceiptPdf(renderInput);
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
