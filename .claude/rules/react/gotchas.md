---
description: React Gotchas・禁止事項・参考リンク（Activity 禁止・Prisma Symbol エラー・hydration等）
paths:
  - "src/**/*.tsx"
  - "src/**/use-*.ts"
  - "src/**/use[A-Z]*.ts"
  - "src/**/hooks.ts"
  - "src/**/hooks/**/*.ts"
  - "src/**/_hooks/**/*.ts"
  - "src/**/editor/**/*.ts"
  - "src/shared/lib/conform/**"
---

# React Gotchas・禁止事項

> React 19 / React Compiler 1.0 対応

## React 19 `<Activity>` — 採用条件

`<Activity>` は **React 19 で stable 化**（2025-10-01 公式リリース）。`unstable_Activity` ではなく正式 `Activity` として export される。`hidden` でも state 保持 + effect unmount + 低優先レンダー継続という挙動で、navigation preload（BFCache 代替）・back navigation の state 復元・ViewTransition と組合せた preload が公式推奨の用途。

ただし `display: none` で DOM を非表示にするため **CSS transform / opacity アニメーションと非互換**（hidden 中は画面から消えるためアニメーション中の要素が見えない）。

### 採用可能ケース

```typescript
// OK: navigation preload (BFCache 代替) / back navigation の state 復元
import { Activity } from 'react'
<Activity mode={isPreloading ? 'visible' : 'hidden'}>
  <ExpensiveComponent />
</Activity>
```

### 採用不可ケース（アニメーション中の切替）

```typescript
// NG: Activity は display: none でアニメーション中に要素が消える
<Activity mode={isHidden ? 'hidden' : 'visible'}>
  <AnimatedPanel />  {/* transform/opacity transition が途中で飛ぶ */}
</Activity>

// OK: CSS visibility / opacity で代替（DOM を保持しアニメーション可能）
<div style={{ visibility: isHidden ? 'hidden' : 'visible' }}>
  <AnimatedPanel />
</div>
```

**判断基準**: preload / bfcache ユースケース以外では `visibility` / `opacity` 継続推奨。本プロジェクトでは現時点で Activity 採用箇所なし。新規採用時は用途の妥当性を path-scoped rule 本文 + git log に記録。

---

## 禁止事項（本文未掲載のパターン）

上記各セクションに加え、以下のパターンも禁止:

| 禁止パターン                                                           | 代替                                                                 |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `useOptimistic` なしで楽観的 UI を手動実装                             | `useOptimistic` を使用                                               |
| `useFormStatus` を `<form>` の外で使用                                 | `<form>` 子孫コンポーネント内に配置                                  |
| クラスコンポーネント（新規作成）                                       | 関数コンポーネント（Compiler 対応）                                  |
| `use(fetchData())` をコンポーネント内に直接記述                        | Suspense boundary の外で Promise を生成して渡す                      |
| `ViewTransition` を `startTransition` 外で使用                         | `startTransition` で状態更新をラップする                             |
| `useId` の生成値を文字列として依存                                     | `id` 属性への渡し方のみ使用（形式は変更される可能性あり）            |
| `useSyncExternalStore` の `getServerSnapshot` で毎回新しい `[]` / `{}` | モジュール定数で参照を固定（上記「getServerSnapshot の参照安定性」） |

---

## Gotchas

- **一回限りの JS 駆動アニメ（フラッシュ/ハイライト等）は `element.animate()`（Web Animations API）を使う** — `setTimeout` でクラス除去は `@eslint-react/web-api-no-leaked-timeout`、`addEventListener("animationend", ...)` は `{ once: true }` でも `@eslint-react/web-api-no-leaked-event-listener`（+ inline listener 警告）に触れる。WAAPI は self-managing で cleanup（timer / listener）不要・[Baseline widely available](https://developer.mozilla.org/en-US/docs/Web/API/Element/animate)。色は CSS 変数を keyframe 値に埋める（`boxShadow: "0 0 0 3px color-mix(in oklch, var(--color-primary) 45%, transparent)"`、ハードコードカラー禁止と整合）。参照実装: `CommentPlugin` の `SCROLL_TO_MARK_COMMAND`（本文マークのフラッシュ）
- **自動切替コンテンツに `role="alert"` 禁止** — `role="alert"` は暗黙で `aria-live="assertive"` を設定し、切替のたびにスクリーンリーダーが割り込む。カルーセル等には `role="region" aria-live="polite" aria-label="..."` を使用
- **ダイアログを条件分岐の内側でレンダリング禁止** — early return や三項演算子の片側に `<Dialog>` / `<AlertDialog>` を置くと、他の状態から `open={true}` にしても表示されない。ダイアログはコンポーネント末尾のトップレベルで常にレンダリングする
- **`FormLabel` は `FormField` の `render` prop 内でのみ使用可能** — `FormLabel` 内部で `useFormField()` を呼ぶため、`FormField` コンテキスト外で使うと `useFormField should be used within <FormField>` ランタイムエラー。プレビューラベル等のフォーム外テキストには `<p className="text-sm font-medium">` を使用
- **Prisma オブジェクトを Client Component や `'use cache'` 関数の戻り値に使うと Symbol エラー** — `nodejs.util.inspect.custom` 等の Symbol プロパティが混入し `Only plain objects can be passed to Client Components` エラーが発生。`'use cache'` 関数の戻り値も React シリアライゼーション層を通るため同様。**ドメインクエリ層**（`public-queries.ts` 等）で `toPlainObject`/`toPlainArray` + `Decimal` → `Number` 変換を一元化し、呼び出し側での変換を不要にする。`Date` フィールドは実行時 ISO 文字列になるため表示には `toISOString()` / `formatSerializedDate()` を使用
- **`toPlainObject` は `Serialized<T>` を返す** — ドメインクエリが `toPlainObject()` を通すと `Date` → `string` 変換 + function プロパティ除去 + Symbol key 除去 が型レベルでも narrow される (PR #135 で `Serialized<T>` 型を JSON.stringify 挙動と完全一致させた)。クエリの戻り型は `Serialized<T>` で宣言し、Client Component の props も `Serialized<T>` で受け取る。`Date` 型のまま Client Component に渡すと実行時は `string` なのに型は `Date` になる不整合が発生する
- **`element.style.*` への色指定も CSS 変数を使う** — `el.style.backgroundColor = "oklch(...)"` 禁止。`color-mix(in oklch, var(--color-background) 90%, transparent)` や `var(--shadow-sm)` 等の CSS 変数参照で記述する。ScrollTrigger コールバック等の GSAP 内インラインスタイルも同様
- **管理者入力 HTML は `SanitizedHtml` 必須** — 生の HTML 直接レンダリング禁止。`import { SanitizedHtml } from "@/shared/components/SanitizedHtml"` を使う（isomorphic-dompurify, ADD_TAGS: ['iframe']）。例外: JSON-LD の `<script type="application/ld+json">` は JSON.stringify() 経由のため安全で変更不要
- **`useFormStatus` は conform `useActionState` + native `<form action={action}>` で正しく動作する** — `useActionState(serverAction, undefined)` + `<form action={action}>` パターン経由で `useFormStatus` 内 `pending` は SubmitButton 子孫で取得可能。React Hook Form は `package.json` から完全削除済のため、`useFormStatus` 子孫パターンが唯一の canonical
- **`DndContext`（@dnd-kit）には必ず `id` prop を付与** — 未指定だと内部カウンター（`DndDescribedBy-N`）が SSR/クライアントでずれ hydration mismatch が発生する。固定コンポーネントは文字列リテラル（`id="xxx-sortable"`）、汎用コンポーネントは `useId()` を使用
- **`@eslint-react/eslint-plugin` v4 でルール名プレフィックスフラット化** — `@eslint-react/dom/no-xxx` → `@eslint-react/dom-no-xxx`、`@eslint-react/web-api/no-xxx` → `@eslint-react/web-api-no-xxx`。eslint-disable コメントと `eslint.config.mjs` のルール名を一括置換。v4 で `@eslint-react/purity` の `new Date()` false positive が大幅改善（大半の disable コメントを削除可能）
- **JSX 内の IIFE 禁止**（`@eslint-react/unsupported-syntax`）— `{(() => { ... })()}` パターンは React Compiler が最適化できないため error。JSX 前に変数抽出する
- **`useSyncExternalStore` の `getServerSnapshot` で配列・オブジェクトを毎回新規生成しない** — `return []` / `return {}` は NG。モジュール定数や固定参照を返す。プリミティブ（`null`, `false` 等）は OK
- **`// eslint-disable-next-line` は multi-line JSX element の別 line の prop に効かない** — JSON-LD 用 `<script>` 等で element 開始 line（`<script` の前）に disable comment を置いても、`@eslint-react/dom-no-dangerously-set-innerhtml` rule は別 line の prop で trigger するため抑制されない（disable は element 開始 line のみに作用）。canonical: file 先頭 / module 先頭に block-level `/* eslint-disable @eslint-react/dom-no-dangerously-set-innerhtml -- JSON-LD: JSON.stringify + Unicode-escaped, safe for structured data */` を置く（`@/public/components/seo/json-ld.tsx` が参照実装）
- **`exactOptionalPropertyTypes` で Prisma create の optional フィールドに `input.field` を直接渡せない** — `field?: string` に `string | undefined` は非互換。条件スプレッド `...(input.field !== undefined && { field: input.field })` を使用。`notifications/commands.ts` パターン参照
- **`exactOptionalPropertyTypes` で pricing 関数の `null` と `undefined` を混同しない** — `calculateReservationPrice` の `spaceDiscount` は `SpaceDiscountSettings | null`。`undefined` を渡すと型エラー

## 参考

- [React 19 リリースノート](https://react.dev/blog/2024/12/05/react-19)
- [React Compiler 1.0 リリースノート](https://react.dev/blog/2025/10/07/react-compiler-1)
- [ref as a prop（forwardRef 廃止）](https://react.dev/blog/2024/04/25/react-19#ref-as-a-prop)
- [React Compiler — インストール](https://react.dev/learn/react-compiler/installation)
- [React Compiler — 段階的採用](https://react.dev/learn/react-compiler/incremental-adoption)
- [React Compiler — デバッグ](https://react.dev/learn/react-compiler/debugging)
- ['use no memo' ディレクティブ](https://react.dev/reference/react-compiler/directives/use-no-memo)
- [eslint-plugin-react-hooks](https://react.dev/reference/eslint-plugin-react-hooks)
