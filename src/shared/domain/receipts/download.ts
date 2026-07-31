import "server-only";

import { prisma } from "@/shared/db/prisma";
import {
  renderReceiptPdf,
  type RenderReceiptInput,
} from "@/shared/pdf/render-receipt-pdf";

/**
 * ゲスト署名 URL 経路の単発 DL claim (RECEIPT-USEDAT-P1)。
 *
 * ## 呼出契約
 * - `receiptId` は `findReceiptForDownload` で解決済みの Receipt.id を渡す。
 * - `input` は `renderReceiptPdf` に渡す render 引数 (`Receipt.taxRate` は Int %)。
 *
 * ## 挙動 — render は DB の外、claim は updateMany の WHERE で
 * 1. `usedAt` を安価に事前確認する。既に非 NULL なら "already_used" (=404 相当)。
 *    レースを閉じるためではなく、消費済みトークンで無駄に render しないため。
 * 2. **トランザクション外**で PDF を render する。
 * 3. `updateMany({ where: { id, usedAt: null } })` で単発 claim する。
 *    更新できたのは 1 リクエストだけなので、これが単発性の正本
 *    (`.claude/rules/business-domain.md` の「updateMany の WHERE で claim」パターン)。
 * 4. claim できなければ "already_used"、できれば Buffer を返す。
 *
 * ## なぜ tx 内 render をやめたか（本番 500 の実因）
 * 旧実装は advisory lock + `usedAt` 再 fetch + **render** + UPDATE を 1 つの
 * interactive tx (timeout 30 s) に閉じ込めていた。`@react-pdf/renderer` の render は
 * 秒オーダーの CPU 処理で、その間ずっと
 *
 * - pool の接続を 1 本占有し続ける（同時 DL でプールを食い潰す）
 * - Node のイベントループを塞ぎ pg のソケットを捌けない
 *
 * ため接続が壊れ、`Client has encountered a connection error and is not queryable`
 * で Route Handler が 500 を返していた（広域 E2E run 30569714860 / 30595374008 の
 * `guest-receipt-single-use` が両方でこれ。`operation: receiptPdfDownload`）。
 *
 * ## 失敗時セマンティクス
 * render 失敗は claim の**前**に起きるので `usedAt` は刻印されない = リトライ可能。
 * 旧実装の「roll back で刻印を取り消す」と同じ結果を、補償書込なしで得る。
 *
 * ## レース
 * 事前確認をすり抜けた同時リクエストは双方 render するが、`updateMany` で
 * 更新できるのは 1 件だけなので単発性は保たれる（敗者は "already_used"）。
 * 稀なレース時に 1 回分の render が無駄になるのは許容し、その代わりに
 * 「秒オーダーの CPU 処理の間 advisory lock で他要求を待たせる」構造をなくす。
 *
 * ## Better Auth session 経路との分離
 * 本関数は **token 経路専用**。session 経路 (mypage) は本関数を経由せず、
 * Route Handler が直接 `renderReceiptPdf` を呼ぶ (usedAt 無視・無制限 DL)。
 */
export type SingleUseTokenDownloadResult =
  { status: "success"; pdfBuffer: Buffer } | { status: "already_used" };

export async function claimReceiptForSingleUseTokenDownload(
  receiptId: string,
  input: RenderReceiptInput,
): Promise<SingleUseTokenDownloadResult> {
  // 1. 消費済みトークンで render を走らせないための安価な事前確認。
  const current = await prisma.receipt.findUnique({
    where: { id: receiptId },
    select: { usedAt: true },
  });
  if (!current || current.usedAt !== null) {
    return { status: "already_used" };
  }

  // 2. DB 接続を掴まずに render する（失敗しても usedAt は未刻印のまま）。
  const pdfBuffer = await renderReceiptPdf(input);

  // 3. 単発性の正本。更新できるのは 1 リクエストのみ。
  const claimed = await prisma.receipt.updateMany({
    where: { id: receiptId, usedAt: null },
    data: { usedAt: new Date() },
  });
  if (claimed.count !== 1) {
    return { status: "already_used" };
  }

  return { status: "success", pdfBuffer };
}
