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
 * ## 挙動 — claim を先に取り、勝者だけが render する
 * 1. `updateMany({ where: { id, usedAt: null } })` で単発 claim する。
 *    更新できたのは 1 リクエストだけなので、これが単発性の正本
 *    (`.claude/rules/business-domain.md` の「updateMany の WHERE で claim」パターン)。
 *    敗者はここで "already_used" (=404 相当) になり、render に進まない。
 * 2. 勝者が **トランザクション外**で PDF を render する。
 * 3. render が失敗したら自分の claim だけを解放し (`where: { usedAt: claimedAt }`)、
 *    エラーを再 throw する。次回リクエストで再取得できる。
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
 * ## なぜ render の後ではなく前に claim するか
 * 同一トークンの同時要求（二重送信・rate limiter が許す 10 回まで）が全部 render に
 * 進むと、秒オーダーの CPU 処理が並走して Cloud Run インスタンスを飽和させる。
 * claim を先に取れば render するのは常に 1 リクエストだけで、DB 接続も掴まない。
 *
 * ## トレードオフ（意図的）
 * claim と render の間でプロセスが落ちると `usedAt` が刻印されたまま残り、
 * そのトークンは失効する（旧実装は tx の roll back で自動復帰していた）。
 * render 失敗の通常経路は上記 3 の解放で戻すため、残るのはプロセス強制終了時のみ。
 * 実際に本番 500 を起こしていた「render 中の接続占有」を消す方を優先する。
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
  // 1. 単発 claim。更新できるのは 1 リクエストのみ = 単発性の正本。
  const claimedAt = new Date();
  const claimed = await prisma.receipt.updateMany({
    where: { id: receiptId, usedAt: null },
    data: { usedAt: claimedAt },
  });
  if (claimed.count !== 1) {
    return { status: "already_used" };
  }

  // 2. 勝者だけが render する（DB 接続は掴まない）。
  try {
    const pdfBuffer = await renderReceiptPdf(input);
    return { status: "success", pdfBuffer };
  } catch (error) {
    // 3. 自分の claim だけを解放してリトライ可能に戻す。
    await prisma.receipt.updateMany({
      where: { id: receiptId, usedAt: claimedAt },
      data: { usedAt: null },
    });
    throw error;
  }
}
