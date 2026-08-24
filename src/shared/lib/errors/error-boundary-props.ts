/**
 * App Router error boundary の props — `next/error` の `ErrorInfo` を、
 * 呼び出し側 34 ファイル（`error.tsx` 33 本 + `global-error.tsx`）から隔離する単一 seam。
 *
 * next は `package.json` で完全 pin されている（版数はここに写さない —
 * 写すと必ず drift する。監査 A-81 で実際に 16.3.0 と 16.3.2 でずれていた）。
 * その `ErrorInfo` は
 * `{ error: unknown; reset: () => void; retry: () => void }`
 * （node_modules/next/dist/client/components/error-boundary.d.ts）。
 * `ErrorBoundaryHandler` は `errorComponent` へこの 3 つを無条件に渡し、
 * `global-error.tsx` も同じ boundary を通るため、`retry` が欠ける経路は無い。
 * 16.2 の `unstable_retry` は Next 側の実装から消えている（同梱 docs の
 * `error.js` ファイル規約ページの Version History が
 * 「retry prop became stable.」を記録している）。
 * 版を上げるときは `node_modules/next` 同梱の docs を見ること（版一致の一次資料）。
 *
 * **seam を残す理由はバージョン差の吸収ではない。** 残す理由は 2 つ:
 *
 * 1. `error: unknown` の narrowing を 1 箇所に集める。Next は
 *    `getDerivedStateFromError(thrownValue: unknown)` が受けた値を加工せずに
 *    boundary へ渡す（実装に `// TODO(NAR-804): Docs say this is an Error object,
 *    but we don't guarantee that` と書かれている）ので、Error 以外も到達しうる。
 * 2. `retry` を直接触らせないことで、次に Next 側が prop 名を変えたときに
 *    34 ファイルではなくこのファイルだけを直せる状態を保つ。この単一入口は
 *    `__tests__/unit/architecture/next-error-boundary-contract.test.ts` が
 *    機械強制している。
 */

export type ErrorBoundaryProps = {
  readonly error: unknown;
  readonly retry: () => void;
};

/**
 * 再試行ハンドラ。`retry()` は boundary の children を再 fetch・再描画するため、
 * Server Component の失敗からも復帰できる（`reset()` は再 fetch しないので使わない）。
 */
export function errorBoundaryRetry(props: ErrorBoundaryProps): () => void {
  return props.retry;
}

/**
 * Next.js が本番ビルドで付ける error digest を安全に取り出す。
 *
 * `error` は `unknown` なので、boundary 側で毎回 narrowing を書かずに済むよう
 * ここへ集約する。
 */
export function errorBoundaryDigest(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if (!("digest" in error)) return undefined;
  const { digest } = error;
  return typeof digest === "string" ? digest : undefined;
}
