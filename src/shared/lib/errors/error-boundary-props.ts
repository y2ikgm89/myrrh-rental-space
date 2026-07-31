/**
 * App Router error boundary の props — Next.js バージョン差を閉じ込める単一 seam。
 *
 * `next/error` の `ErrorInfo` は Next.js 16.2 → 16.3 で 2 点変わる:
 *
 * | prop    | 16.2.x           | 16.3.x    |
 * | ------- | ---------------- | --------- |
 * | `error` | `Error`          | `unknown` |
 * | retry   | `unstable_retry` | `retry`   |
 *
 * `error.tsx` / `global-error.tsx` が `ErrorInfo` を直 import していると bump で
 * 34 ファイルすべてを触ることになるため、両バージョンを受理する型をここに一本化する。
 * `error: unknown` + retry 2 名 optional は 16.2 / 16.3 どちらの `ErrorInfo` からも
 * 代入可能なので、Next が生成する route type validation
 * （`ErrorComponent = ComponentType<ErrorInfo>`）をどちらでも満たす。
 *
 * **16.3 へ上げるときは本ファイルだけ直す** — `retry` を required にし、
 * `unstable_retry` と `errorBoundaryRetry` のフォールバックを削除する。
 * 呼び出し側 34 ファイルは無変更で済む。
 *
 * 16.3 系への移行動機（`useDeferredValue` stuck による Server Action の
 * pending 固着）は下記 issue を参照。
 *
 * @see https://github.com/vercel/next.js/issues/86055
 * @see https://github.com/facebook/react/pull/36134
 */

export type ErrorBoundaryProps = {
  readonly error: unknown;
  /** Next.js 16.3+ */
  readonly retry?: (() => void) | undefined;
  /** Next.js 16.2 — 16.3 で `retry` に改名 */
  readonly unstable_retry?: (() => void) | undefined;
};

/**
 * バージョン差を吸収した再試行ハンドラ。
 *
 * どちらの prop も無い場合（= 想定外の Next.js バージョン）は再試行ボタンを
 * 無反応にせずリロードにフォールバックする。
 */
export function errorBoundaryRetry(props: ErrorBoundaryProps): () => void {
  const retry = props.retry ?? props.unstable_retry;
  if (retry) return retry;
  return () => {
    window.location.reload();
  };
}

/**
 * Next.js が本番ビルドで付ける error digest を安全に取り出す。
 *
 * `error` は 16.3 で `unknown` になるため、boundary 側で毎回 narrowing を
 * 書かずに済むようここへ集約する。
 */
export function errorBoundaryDigest(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null) return undefined;
  if (!("digest" in error)) return undefined;
  const { digest } = error;
  return typeof digest === "string" ? digest : undefined;
}
