/**
 * Next.js Instrumentation
 *
 * - `register`: サーバー起動時に1回だけ実行（Zod JIT の有効化 + 本番 env 検証 +
 *   システムページ自動保証）。
 * - `onRequestError`: サーバーが捕捉した未処理エラー（Server Component の render /
 *   Route Handler / Server Action / proxy）を構造化ログに流し、Cloud Error Reporting で
 *   グルーピング可能にする。これが無いと未捕捉エラーは plain stack trace で stderr に
 *   出るだけで `@type` ReportedErrorEvent マーカーが付かず、Error Reporting に集約されない。
 *
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/instrumentation
 */

import "@/shared/lib/validations/zod-ja";
import type { Instrumentation } from "next";
import { isRecord } from "@/shared/lib/serialize";
import { redactRequestUrl } from "@/shared/lib/errors/redaction";

export async function register(): Promise<void> {
  if (process.env["NEXT_RUNTIME"] === "nodejs") {
    // Zod 4.5 の JIT を server プロセスにだけ入れる（Zod 公式のアプリ向け作法）。
    // side-effect import で `globalConfig.postProcessor` が刺さり、**これより後に
    // 構築された**スキーマが初回 parse 時に `new Function()` へコンパイルされる。
    //
    // ここに置く理由（top-level import ではなく）:
    // - top-level に書くと edge バンドルにも入る。edge は `new Function` を禁じて
    //   いるので毎回 catch されて無駄になる（Zod は握って runtime parser に戻す）。
    //   `NEXT_RUNTIME` は build 時に定数化されるので、この枝ごと edge から消える。
    // - 順序は足りている。`unstable_preloadEntries()` は `await this.prepare()` を
    //   先頭で待ち、`prepare()` は `loadInstrumentationModule()` →
    //   `prepareImpl()` → `register()` を順に await する
    //   （next/dist/server/{base-server,next-server}.js）。つまり route と
    //   セクションスキーマの評価はここが終わってから始まる。
    // - client バンドルには元々入らない（instrumentation は server 専用）。本番 CSP は
    //   `'unsafe-eval'` を持たないので、ブラウザ側で JIT を踏ませてはならない。
    //
    // 損得（Node 26 / V8 実測。セクション config 相当のスキーマ）: 初回コンパイル
    // 1.25 ms/schema に対し、1 回の parse が 1267 ns 速くなる（5.5 倍）。**同じ
    // スキーマを約 1000 回 parse したところで元が取れる。** インスタンスが短命だと
    // 取り返せないので、遅くなったら消してよい 1 行として置いている。
    await import("zod/compile");

    const { validateProductionEnv } = await import("@/shared/lib/env/server");
    validateProductionEnv();

    const { serverEnv } = await import("@/shared/lib/env/server");
    if (serverEnv.APP_SURFACE === "admin") {
      const { bootstrapSystemPages } =
        await import("@/shared/domain/pages/system-pages-server");
      await bootstrapSystemPages();
    }

    // Sync credential check only. Canary purge is observation and must not
    // block Cloud Run startup (probe budget ~90s).
    const { getCloudflareCredentialsValidated } =
      await import("@/shared/lib/cloudflare");
    getCloudflareCredentialsValidated();

    const { assertCloudflareCredentials } =
      await import("@/shared/lib/cache/health");
    void assertCloudflareCredentials();

    const { recordConnectionApiResult } =
      await import("@/shared/domain/settings/connection-health");
    const { bindConnectionHealthRecorder } =
      await import("@/shared/lib/integration-health-port");
    bindConnectionHealthRecorder(recordConnectionApiResult);
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

/**
 * React の RSC renderer が **クライアント側が消えたとき**に投げるキャンセル。
 *
 * `react-server-dom-webpack-server.node` は destination stream に `close` と
 * `error` のハンドラを張り、どちらも `createCancelHandler(request, reason)` で
 * `Error(reason)` を投げる。`code` も専用クラスも持たないので、判定はメッセージ
 * 文字列でしかできない。
 *
 * 無視するのは `close` 側だけ。**`error` 側
 * （"The destination stream errored while writing data."）は意図的に残す** —
 * 素の close は「利用者が保存中に画面を離れた」で正常だが、書込中の error は
 * transport の障害なので、消すと気づけなくなる。
 *
 * 実物: node_modules/next/dist/compiled/react-server-dom-webpack/cjs/
 * react-server-dom-webpack-server.node.production.js
 */
const REACT_DESTINATION_CLOSED_EARLY = "The destination stream closed early.";

/**
 * Cloud Error Reporting へ送らないエラー。
 *
 * `onRequestError` に届くもののうち、**アプリの障害ではなくクライアント都合の
 * 切断**を落とす。落とさないと `terraform/monitoring.tf` の
 * 「reported error events > 20 / 5 min」が利用者の離脱で発火し、本物のエラーが
 * その中に埋もれる。実測: CI run 32964590575 の E2E で
 * `/admin/settings/features` の Server Action に対して 12 件以上出ていた
 * （保存の応答ヘッダが返った直後に画面遷移する経路）。
 */
export function shouldIgnoreRequestError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  if (error.message === REACT_DESTINATION_CLOSED_EARLY) return true;
  return (
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

  const {
    logError,
    ErrorCategory,
    ErrorSeverity,
    parseCloudTraceContext,
    parseFlatTraceHeaders,
  } = await import("@/shared/lib/errors/server");

  const digest =
    isRecord(error) && typeof error["digest"] === "string"
      ? error["digest"]
      : undefined;

  // proxy (createResponse) で `x-trace-id` / `x-span-id` を転写済み。
  // edge を経由しない直接呼び出し（cron や internal）でも上流 LB が発行する
  // `x-cloud-trace-context` を fallback で再解析する。
  //
  // flat header も**形式検証してから**採用する（監査 A-95）。proxy が剥がすように
  // なったので edge 経由なら不正値は届かないが、ここは edge を経由しない経路でも
  // 呼ばれるので二重化する。traceId が不正なら組ごと捨てて fallback へ落ちる。
  const flat = parseFlatTraceHeaders({
    traceId: pickHeader(request.headers, "x-trace-id"),
    spanId: pickHeader(request.headers, "x-span-id"),
    sampled: pickHeader(request.headers, "x-trace-sampled"),
  });
  const fallback = flat
    ? null
    : parseCloudTraceContext(
        pickHeader(request.headers, "x-cloud-trace-context"),
      );

  const traceContext = flat ?? fallback;
  const traceId = traceContext?.traceId;
  const spanId = traceContext?.spanId;
  const traceSampled = traceContext?.traceSampled;

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
