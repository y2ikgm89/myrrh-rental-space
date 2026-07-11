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
import { isRecord } from "@/shared/lib/serialize";
import { redactRequestUrl } from "@/shared/lib/errors/redaction";

export async function register(): Promise<void> {
  if (process.env["NEXT_RUNTIME"] === "nodejs") {
    const { validateProductionEnv } = await import("@/shared/lib/env/server");
    validateProductionEnv();

    const { bootstrapSystemPages } = await import("@/shared/lib/bootstrap");
    await bootstrapSystemPages();

    // Cloudflare credentials + tag purge startup probe (production only).
    // Surfaces missing/malformed credentials or purge API failures as
    // HIGH-severity logError.
    const { assertCloudflareCredentials } =
      await import("@/shared/lib/cache/health");
    await assertCloudflareCredentials();
  }
}

/**
 * Next.js が `onRequestError` に渡す request headers は `NodeJS.Dict<string|string[]>` 型。
 * Cloud Logging `httpRequest`・trace 特殊フィールドの組み立て用に正規化して取り出す。
 */
function pickHeader(
  headers: NodeJS.Dict<string | string[]>,
  name: string,
): string | undefined {
  const value = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(value)) return value[0];
  return value;
}

export function shouldIgnoreRequestError(error: unknown): boolean {
  return (
    error instanceof Error &&
    error.message === "aborted" &&
    isRecord(error) &&
    error["code"] === "ECONNRESET"
  );
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
 * Cloud Logging 特殊 payload field (`logging.googleapis.com/trace`・`spanId`・`httpRequest`)
 * を top-level に積むことで、1 request 単位でログを横断検索できる
 * （Cloud Trace と紐付き、Cloud Logging UI の "Related entries" で同 trace の全ログを辿れる）。
 *
 * server-only な logger を edge バンドルへ引き込まないよう nodejs runtime に限定し、
 * 動的 import で読み込む。
 *
 * @see https://cloud.google.com/logging/docs/structured-logging#special-payload-fields
 */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  if (process.env["NEXT_RUNTIME"] !== "nodejs") return;
  if (shouldIgnoreRequestError(error)) return;

  const { logError, ErrorCategory, ErrorSeverity, parseCloudTraceContext } =
    await import("@/shared/lib/errors/server");

  const digest =
    isRecord(error) && typeof error["digest"] === "string"
      ? error["digest"]
      : undefined;

  // proxy (createResponse) で `x-trace-id` / `x-span-id` を転写済み。
  // edge を経由しない直接呼び出し（cron や internal）でも上流 LB が発行する
  // `x-cloud-trace-context` を fallback で再解析する。
  const headerTraceId = pickHeader(request.headers, "x-trace-id");
  const headerSpanId = pickHeader(request.headers, "x-span-id");
  const headerSampled = pickHeader(request.headers, "x-trace-sampled");
  const fallback = headerTraceId
    ? null
    : parseCloudTraceContext(
        pickHeader(request.headers, "x-cloud-trace-context"),
      );

  const traceId = headerTraceId ?? fallback?.traceId;
  const spanId = headerSpanId ?? fallback?.spanId;
  const traceSampled =
    headerSampled !== undefined
      ? headerSampled === "1"
      : fallback?.traceSampled;

  const userAgent = pickHeader(request.headers, "user-agent");
  const referer = pickHeader(request.headers, "referer");
  const forwardedFor = pickHeader(request.headers, "x-forwarded-for");
  const remoteIp = forwardedFor?.split(",")[0]?.trim();
  const host = pickHeader(request.headers, "host");
  const proto =
    pickHeader(request.headers, "x-forwarded-proto") ??
    (process.env["NODE_ENV"] === "production" ? "https" : "http");
  // Next.js の `request.path` は query string を含む可能性がある
  // (`InstrumentationOnRequestError` の型定義上 `path: string`)。
  // Cloud Logging は Log Explorer 権限保持者に生流しになるため、instrumentation
  // 段で先に redaction する。redactRequestUrl は query を必ず `?[redacted]` に
  // 落とし、path のセグメント値 (UUID / slug) は残す。
  const rawUrl = host ? `${proto}://${host}${request.path}` : request.path;
  const requestUrl = redactRequestUrl(rawUrl);
  const contextPath = redactRequestUrl(request.path);
  const redactedReferer = referer ? redactRequestUrl(referer) : undefined;

  logError(error, {
    category: ErrorCategory.UNKNOWN,
    severity: ErrorSeverity.HIGH,
    context: {
      path: contextPath,
      method: request.method,
      routePath: context.routePath,
      routeType: context.routeType,
      ...(digest ? { digest } : {}),
    },
    ...(traceId ? { traceId } : {}),
    ...(spanId ? { spanId } : {}),
    ...(typeof traceSampled === "boolean" ? { traceSampled } : {}),
    httpRequest: {
      requestMethod: request.method,
      requestUrl,
      ...(userAgent ? { userAgent } : {}),
      ...(redactedReferer ? { referer: redactedReferer } : {}),
      ...(remoteIp ? { remoteIp } : {}),
      protocol: proto,
    },
  });
};
