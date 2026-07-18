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
 * - `input` は `renderReceiptPdf` に渡す render 引数 (Decimal → number 変換済み)。
 *
 * ## 挙動
 * interactive `$transaction` 内で:
 * 1. **advisory lock** (`pg_advisory_xact_lock(728353, hashtext(receiptId))`) を先取。
 *    領収書連番採番と同一 namespace を共有する (`.claude/rules/db-domain.md` の
 *    728353 = 領収書連番採番)。並行 DL 要求は tx 終了まで待たされる。
 * 2. `usedAt` を再 fetch。既に非 NULL なら "already_used" (=404 相当) を返す。
 * 3. PDF を **tx 内で** render する。render が throw すれば tx が roll back し、
 *    `usedAt` の刻印は取り消される (次回リトライで再取得可)。
 * 4. `usedAt = new Date()` を UPDATE。
 * 5. commit 後、Buffer を返す。
 *
 * ## Better Auth session 経路との分離
 * 本関数は **token 経路専用**。session 経路 (mypage) は本関数を経由せず、
 * Route Handler が直接 `renderReceiptPdf` を呼ぶ (usedAt 無視・無制限 DL)。
 *
 * ## Race free (Codex 想定質問への回答)
 * advisory lock 取得後の `usedAt` re-fetch はロック内で行うため、二並行 tx は
 * lock 順序で serialize され、後発は先発の commit 後に `usedAt` の非 NULL を
 * 観測して "already_used" を返す。lock 取得前の findUnique では観測しない
 * (= belt-and-suspenders でなく正規経路)。
 */
export type SingleUseTokenDownloadResult =
  { status: "success"; pdfBuffer: Buffer } | { status: "already_used" };

const RECEIPT_LOCK_NAMESPACE = 728353;

/**
 * Interactive tx timeout for `claimReceiptForSingleUseTokenDownload`.
 *
 * PDF rendering (`renderReceiptPdf`, @react-pdf/renderer) is expensive: cold-start
 * font initialization + PDF layout can exceed the Prisma default 5000 ms interactive
 * tx timeout. Because the tx wraps `usedAt` re-fetch + render + `usedAt` UPDATE
 * (design: render throw must roll back the usedAt stamp), the tx must survive the
 * whole render.
 *
 * Empirically observed 12+ seconds on Windows dev / first-request cold path
 * (surfaced by E2E-03, `e2e/public/guest-receipt-single-use.spec.ts`). Cloud Run
 * cold starts share the same class of latency, so this must not depend on env.
 *
 * 30 s covers realistic worst case with comfortable margin while remaining short
 * enough that the advisory lock does not starve concurrent DL requests. `maxWait`
 * (queue wait for a pool connection) is capped separately.
 */
const RECEIPT_DOWNLOAD_TX_TIMEOUT_MS = 30_000;
const RECEIPT_DOWNLOAD_TX_MAX_WAIT_MS = 10_000;

export async function claimReceiptForSingleUseTokenDownload(
  receiptId: string,
  input: RenderReceiptInput,
): Promise<SingleUseTokenDownloadResult> {
  return prisma.$transaction(
    async (tx) => {
      // 1. advisory lock — 領収書 id 単位で並行 DL 要求を serialize する。
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${RECEIPT_LOCK_NAMESPACE}::int4, hashtext(${receiptId}))`;

      // 2. lock 内で usedAt を re-fetch (race free)
      const current = await tx.receipt.findUnique({
        where: { id: receiptId },
        select: { usedAt: true },
      });
      if (!current) {
        // 呼出契約: findReceiptForDownload 直後に呼ばれるはずだが、tx race で消えるケースは 404 扱い。
        return { status: "already_used" as const };
      }
      if (current.usedAt !== null) {
        return { status: "already_used" as const };
      }

      // 3. render を tx 内で実行 (throw で roll back → usedAt 刻印取消)
      const pdfBuffer = await renderReceiptPdf(input);

      // 4. usedAt 刻印 (WHERE で NULL 再確認、belt-and-suspenders)
      const updated = await tx.receipt.updateMany({
        where: { id: receiptId, usedAt: null },
        data: { usedAt: new Date() },
      });
      if (updated.count !== 1) {
        // advisory lock 内で先の re-fetch を通した以上、通常は必ず 1 件更新される。
        // 万一 update が 0 なら「他 tx が非 lock 経路で刻印済み」= already_used 扱いに寄せる。
        return { status: "already_used" as const };
      }

      return { status: "success" as const, pdfBuffer };
    },
    {
      timeout: RECEIPT_DOWNLOAD_TX_TIMEOUT_MS,
      maxWait: RECEIPT_DOWNLOAD_TX_MAX_WAIT_MS,
    },
  );
}
