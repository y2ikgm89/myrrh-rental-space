import type { FrameLocator, Locator, Page } from "../fixtures/e2e-test";

/**
 * React streaming に対して安全なロケーター。
 *
 * ## なぜ必要か
 *
 * React のストリーミング SSR は、完了した `<Suspense>` boundary の HTML を
 * **hidden な staging container** へ流し込み、インラインスクリプトで in-place の
 * fallback と差し替える。差し替えは
 *
 * - `precedence` 付き stylesheet の読み込み完了待ち
 *   （`completeBoundaryWithStyles` → `Promise.all(deps).then($RC)`）
 * - reveal のバッチ化（`$RB` キュー）
 *
 * で遅延しうるため、その間は **同じ DOM が in-place と hidden staging の 2 箇所に
 * 同時に存在する**。Next.js では `loading.tsx` のセグメント境界と、
 * `generateViewport` の runtime data 対応で `<html>` を包む `<Suspense>`
 * （公式 opt-in パターン）により、ページ本体は必ずいずれかの boundary の内側にある。
 * つまり **ページ内の任意の DOM は一時的に 2 重になりうる**。
 *
 * CSS セレクタ（`locator("#id")`）は hidden 側も一致させるので strict-mode
 * violation になる。実測: CI run 30602667260 で
 * `locator('#event-register') resolved to 2 elements`
 * （片方は解決済みフォーム / もう片方は fallback を抱えた staging copy。
 * a11y スナップショットには 1 つしか現れていなかった）。
 *
 * ## 使い分け
 *
 * 1. **role locator を最優先**（`getByRole("main")` /
 *    `getByRole("region", { name })` 等）。Playwright の role エンジンは既定で
 *    `includeHidden: false` = a11y ツリー非公開の要素を除外するため、staging copy を
 *    構造的に掴まない。
 * 2. role / アクセシブルネームを持たない要素（アンカー用の素の `<section id>` や
 *    conform が振る form id 等）だけ、この `visibleById` を使う。
 */
export function visibleById(
  scope: Page | Locator | FrameLocator,
  id: string,
): Locator {
  return scope.locator(`#${id}`).filter({ visible: true });
}

/**
 * 表示中の要素だけをテキストで掴む。
 *
 * `getByText` は staging copy にも一致するため、role もアクセシブルネームも id も
 * 持たない要素（見出しではない `<p>` のラベル等）を掴むときに strict-mode
 * violation になる。実測: CI run 30621350538 の
 * `getByText('統合対象の履歴（概算）') resolved to 2 elements`。
 *
 * **role locator で掴めるならそちらを優先すること。** これは
 * 「role も id も無い」場合の最後の手段で、`visibleById` と同じ
 * `.filter({ visible: true })` で hidden staging copy を落とす。
 */
export function visibleByText(
  scope: Page | Locator | FrameLocator,
  text: string | RegExp,
  options?: { exact?: boolean },
): Locator {
  return scope.getByText(text, options).filter({ visible: true });
}

/**
 * 表示中の要素だけを CSS セレクタで掴む。
 *
 * `visibleById` の一般形。**role locator で掴めるならそちらを優先すること** —
 * これは `a[href="..."]` のように「role 名では一意にならないが属性なら一意」な
 * ときの手段。CSS セレクタは `visibleById` と同じ理由で hidden staging copy にも
 * 一致するので、`.filter({ visible: true })` が要る。
 *
 * 実測: CI run 33019795606 で `settings.spec.ts` が
 * `getByText('連絡先情報', { exact: true }) resolved to 2 elements` で落ちた。
 * 同ファイルの `a[href="/admin/settings/*"]` 9 箇所も同じ形で、うち 1 つは
 * run 32969253242 で実際に落ちている。
 */
export function visibleBySelector(
  scope: Page | Locator | FrameLocator,
  selector: string,
): Locator {
  return scope.locator(selector).filter({ visible: true });
}
