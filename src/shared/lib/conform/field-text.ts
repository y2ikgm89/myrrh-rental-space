/**
 * conform の `field.value` を**文字列として**読む。
 *
 * ## なぜ必要か
 *
 * conform は値を **live DOM の `new FormData(form)`** から作る
 * (`@conform-to/dom/dist/form.js`)。`FormData` は同じ `name` の要素が複数あれば
 * その全部を拾うので、`FormValue<string | undefined>` が
 * `string | undefined` と宣言していても、**実行時は配列になりうる**。
 * 型はこの状態を表現していないので、`value?.trim()` は静かに `TypeError` になる。
 *
 * React の streaming SSR は完了した `<Suspense>` boundary の HTML を hidden な
 * staging container へ流し込むため、その差し替えの間だけ**同じ input が 2 つ存在
 * しうる**（この repo は `e2e/helpers/streaming-safe-locators.ts` で同じ現象を
 * locator 側でも扱っている）。これがこの形の最有力の発生源だが、**原因が何であれ
 * ここは落ちてはいけない** — form 値を 1 つ読むだけのために、error boundary が
 * ページのセグメントごと差し替わる理由は無い。
 *
 * ## 実害
 *
 * `/admin/reservations/new` が
 * `TypeError: couponCode.value?.trim is not a function` で throw し、
 * 管理画面のエラーバウンダリが描画されていた（Issue #2733）。
 * main の広域 E2E で約 8% の run が落ちていたが、**サーバーには何も残らず**
 * （`onRequestError` は発火せず digest も付かない）、原因の特定に
 * `retain-on-first-failure` の trace とブラウザ例外の添付（PR #2735）が要った。
 *
 * ## 何を返すか
 *
 * 文字列ならそれを、配列なら最初の文字列要素を、いずれでもなければ空文字を返す。
 *
 * **trim しない。** 読みが値を書き換えると、制御入力で末尾スペースが打てなくなる
 * （毎 render で消える）。trim が要るのは検証や比較をする側なので、
 * `conformFieldText(field.value).trim()` と呼び出し側で明示する。
 *
 * **空文字と未入力を区別しない**用途のための helper。区別が要るなら
 * `field.value` を直接見て自分で narrowing すること。
 */
export function conformFieldText(value: unknown): string {
  if (typeof value === "string") return value;

  if (Array.isArray(value)) {
    const first = value.find((entry) => typeof entry === "string");
    return typeof first === "string" ? first : "";
  }

  return "";
}
