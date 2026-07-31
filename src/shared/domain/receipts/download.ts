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
 * ## 挙動 — render は DB の外・単発性は updateMany の WHERE claim
 * 1. `usedAt` を安価に事前確認する（消費済みトークンで無駄に render しないため）。
 * 2. **トランザクション外**で PDF を render する。同一 receipt への同時要求は
 *    in-flight の render promise を共有する（request coalescing）。
 * 3. `updateMany({ where: { id, usedAt: null } })` で単発 claim する。
 *    更新できたのは 1 リクエストだけなので、これが単発性の正本
 *    (`.claude/rules/business-domain.md` の「updateMany の WHERE で claim」パターン)。
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
 * ## なぜ「先に usedAt を刻んで render する」をやめたか
 * `usedAt` を in-flight マーカーに流用すると、render 中の再送信リクエストが
 * `requestReceiptResendByEmail` の **Case C（消費済み）** に落ちて
 * `reissueReceiptCommand` が走り、元 Receipt が detach されて新トークンが発行される。
 * そこで render が失敗して `usedAt` を戻すと、**orphan 化した元トークンと
 * 新トークンの 2 本が有効**になり single-use が破れる（PR #1706 Codex 指摘）。
 * `usedAt` は「消費済み」以外の意味を持たせない。
 *
 * ## 同時 render の抑制
 * 同一 receipt への同時要求（二重送信・rate limiter が許す 10 回まで）が全部
 * 秒オーダーの render に進むとインスタンスを飽和させるため、in-flight の
 * render promise をプロセス内で共有する。単発性は DB の claim が担保しているので、
 * これは純粋に負荷の抑制であり正しさには関与しない。
 *
 * ## Better Auth session 経路との分離
 * 本関数は **token 経路専用**。session 経路 (mypage) は本関数を経由せず、
 * Route Handler が直接 `renderReceiptPdf` を呼ぶ (usedAt 無視・無制限 DL)。
 */
export type SingleUseTokenDownloadResult =
  { status: "success"; pdfBuffer: Buffer } | { status: "already_used" };

/**
 * 同一 receipt に対する in-flight render を共有するための coalescing map。
 * 完了・失敗のどちらでもエントリを消すためリークしない。
 */
const inFlightRenders = new Map<string, Promise<Buffer>>();

function renderReceiptPdfOnce(
  receiptId: string,
  input: RenderReceiptInput,
): Promise<Buffer> {
  const existing = inFlightRenders.get(receiptId);
  if (existing) return existing;

  const pending = renderReceiptPdf(input).finally(() => {
    inFlightRenders.delete(receiptId);
  });
  inFlightRenders.set(receiptId, pending);
  return pending;
}

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

  // 2. DB 接続を掴まずに render する（同時要求は 1 本の render を共有）。
  const pdfBuffer = await renderReceiptPdfOnce(receiptId, input);

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
