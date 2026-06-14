/**
 * Next.js Instrumentation
 *
 * - `register`: サーバー起動時に1回だけ実行（本番 env 検証 + システムページ自動保証）。
 * - `onRequestError`: サーバーが捕捉した未処理エラー（Server Component の render /
 *   Route Handler / Server Action / proxy）を構造化ログに流し、Cloud Error Reporting で
 *   グルーピング可能にする。これが無いと未捕捉エラーは plain stack trace で stderr に
 *   出るだけで `@type` ReportedErrorEvent マーカーが付かず、Error Reporting に集約されない。
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */

import type { Instrumentation } from "next";

export async function register(): Promise<void> {
  if (process.env["NEXT_RUNTIME"] === "nodejs") {
    const { validateProductionEnv } = await import("@/shared/lib/env/server");
    validateProductionEnv();

    const { bootstrapSystemPages } = await import("@/shared/lib/bootstrap");
    await bootstrapSystemPages();
  }
}

/**
 * サーバー未捕捉エラーのフック。
 *
 * `criticalFetch` / Route Handler の try/catch でラップされない経路
 * （Server Component の render throw・generateMetadata・Server Action の未処理例外）を
 * ここで拾い、`logError` 経由で重大度 HIGH（GCP severity=ERROR）として記録する。
 * HIGH は logger-core で `@type: ReportedErrorEvent` マーカーが付与されるため、
 * 追加の GCP 設定なしで Cloud Error Reporting に集約される。`error.digest`（ユーザーに
 * 表示される Error ID）も context に含め、サポート問い合わせとサーバーログを突合可能にする。
 *
 * server-only な logger を edge バンドルへ引き込まないよう nodejs runtime に限定し、
 * 動的 import で読み込む。
 */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env["NEXT_RUNTIME"] !== "nodejs") return;

  const { logError, ErrorCategory, ErrorSeverity } =
    await import("@/shared/lib/errors/server");

  const digest =
    typeof (error as { digest?: unknown }).digest === "string"
      ? (error as { digest: string }).digest
      : undefined;

  logError(error, {
    category: ErrorCategory.UNKNOWN,
    severity: ErrorSeverity.HIGH,
    context: {
      path: request.path,
      method: request.method,
      routePath: context.routePath,
      routeType: context.routeType,
      ...(digest ? { digest } : {}),
    },
  });
};
