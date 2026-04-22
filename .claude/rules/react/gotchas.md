---
description: React Gotchas・禁止事項・参考リンク（Activity 禁止・Prisma Symbol エラー・hydration等）
paths:
  - "src/**/*.tsx"
  - "src/**/*.ts"
---

# React Gotchas・禁止事項

> React 19.2 / React Compiler 1.0 対応

## React 19 `<Activity>` — EXPERIMENTAL 採用禁止

`<Activity>` は `display: none` で DOM を非表示にするため CSS transform アニメーションと非互換（アニメーション中でも要素が消える）。context7/WebFetch で確認済み。

```typescript
// NG: Activity は EXPERIMENTAL — CSS transform アニメーションと非互換
import { unstable_Activity as Activity } from 'react'
<Activity mode="hidden"><AnimatedPanel /></Activity>

// OK: CSS visibility / opacity で代替（DOM を保持しアニメーション可能）
<div style={{ visibility: isHidden ? 'hidden' : 'visible' }}>
  <AnimatedPanel />
</div>
```

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

- **自動切替コンテンツに `role="alert"` 禁止** — `role="alert"` は暗黙で `aria-live="assertive"` を設定し、切替のたびにスクリーンリーダーが割り込む。カルーセル等には `role="region" aria-live="polite" aria-label="..."` を使用
- **ダイアログを条件分岐の内側でレンダリング禁止** — early return や三項演算子の片側に `<Dialog>` / `<AlertDialog>` を置くと、他の状態から `open={true}` にしても表示されない。ダイアログはコンポーネント末尾のトップレベルで常にレンダリングする
- **`FormLabel` は `FormField` の `render` prop 内でのみ使用可能** — `FormLabel` 内部で `useFormField()` を呼ぶため、`FormField` コンテキスト外で使うと `useFormField should be used within <FormField>` ランタイムエラー。プレビューラベル等のフォーム外テキストには `<p className="text-sm font-medium">` を使用
- **Prisma オブジェクトを Client Component や `'use cache'` 関数の戻り値に使うと Symbol エラー** — `nodejs.util.inspect.custom` 等の Symbol プロパティが混入し `Only plain objects can be passed to Client Components` エラーが発生。`'use cache'` 関数の戻り値も React シリアライゼーション層を通るため同様。**ドメインクエリ層**（`public-queries.ts` 等）で `toPlainObject`/`toPlainArray` + `Decimal` → `Number` 変換を一元化し、呼び出し側での変換を不要にする。`Date` フィールドは実行時 ISO 文字列になるため表示には `toISOString()` / `formatSerializedDate()` を使用
- **`toPlainObject` は `Serialized<T>` を返す** — ドメインクエリが `toPlainObject()` を通すと `Date` → `string` に変換される。クエリの戻り型は `Serialized<T>` で宣言し、Client Component の props も `Serialized<T>` で受け取る。`Date` 型のまま Client Component に渡すと実行時は `string` なのに型は `Date` になる不整合が発生する
- **`element.style.*` への色指定も CSS 変数を使う** — `el.style.backgroundColor = "oklch(...)"` 禁止。`color-mix(in oklch, var(--color-background) 90%, transparent)` や `var(--shadow-sm)` 等の CSS 変数参照で記述する。ScrollTrigger コールバック等の GSAP 内インラインスタイルも同様
- **管理者入力 HTML は `SanitizedHtml` 必須** — 生の HTML 直接レンダリング禁止。`import { SanitizedHtml } from "@/shared/components/SanitizedHtml"` を使う（isomorphic-dompurify, ADD_TAGS: ['iframe']）。例外: JSON-LD の `<script type="application/ld+json">` は JSON.stringify() 経由のため安全で変更不要
- **`useFormStatus` は react-hook-form の `onSubmit` パターンと非互換** — `useFormStatus` は `<form action={}>` でのみ動作する。`useFormAction`（react-hook-form + `useTransition`）や **`useActionState` + RHF ハイブリッド**（例: `SpaceEditForm`）では、待機状態は **`SubmitButton` に `isPending` を prop で渡す**（`useActionState` の第3戻り値や `useTransition` の pending）。`useFormStatus` への移行は不要
- **`DndContext`（@dnd-kit）には必ず `id` prop を付与** — 未指定だと内部カウンター（`DndDescribedBy-N`）が SSR/クライアントでずれ hydration mismatch が発生する。固定コンポーネントは文字列リテラル（`id="xxx-sortable"`）、汎用コンポーネントは `useId()` を使用
- **`@eslint-react/eslint-plugin` v4 でルール名プレフィックスフラット化** — `@eslint-react/dom/no-xxx` → `@eslint-react/dom-no-xxx`、`@eslint-react/web-api/no-xxx` → `@eslint-react/web-api-no-xxx`。eslint-disable コメントと `eslint.config.mjs` のルール名を一括置換。v4 で `@eslint-react/purity` の `new Date()` false positive が大幅改善（大半の disable コメントを削除可能）
- **JSX 内の IIFE 禁止**（`@eslint-react/unsupported-syntax`）— `{(() => { ... })()}` パターンは React Compiler が最適化できないため error。JSX 前に変数抽出する
- **`useSyncExternalStore` の `getServerSnapshot` で配列・オブジェクトを毎回新規生成しない** — `return []` / `return {}` は NG。モジュール定数や固定参照を返す。プリミティブ（`null`, `false` 等）は OK

## 参考

- [React 19 リリースノート](https://react.dev/blog/2024/12/05/react-19)
- [React Compiler 1.0 リリースノート](https://react.dev/blog/2025/10/07/react-compiler-1)
- [ref as a prop（forwardRef 廃止）](https://react.dev/blog/2024/04/25/react-19#ref-as-a-prop)
- [React Compiler — インストール](https://react.dev/learn/react-compiler/installation)
- [React Compiler — 段階的採用](https://react.dev/learn/react-compiler/incremental-adoption)
- [React Compiler — デバッグ](https://react.dev/learn/react-compiler/debugging)
- ['use no memo' ディレクティブ](https://react.dev/reference/react-compiler/directives/use-no-memo)
- [eslint-plugin-react-hooks](https://react.dev/reference/eslint-plugin-react-hooks)
- [React Hook Form useWatch](https://react-hook-form.com/docs/usewatch)
