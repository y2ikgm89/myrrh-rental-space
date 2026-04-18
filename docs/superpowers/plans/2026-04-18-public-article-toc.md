# 公開記事ページ Table of Contents 実装計画

> **ステータス**: ✅ 完了（2026-04-19、commit `d375e46a..f01cb01c`）
> 対象: `/posts/[...segments]` / `/news/[slug]`
> 方針: 破壊的変更 OK / 公式ベストプラクティス準拠 / 後方互換性なし / クリーン実装
> 参照: Lexical 0.43 NodeState API、`@lexical/headless`、React 19.2 Compiler 1.0、Tailwind 4 @theme

## ゴール

Lexical エディタで作成した記事本文から h2/h3 を自動抽出し、公開記事ページに以下を表示する:

- **Desktop (`lg+`)**: sticky サイドバー目次（scroll-spy + アクティブ見出しハイライト）
- **Mobile (`<lg`)**: 本文冒頭の `<details>` 折りたたみ目次
- **閾値**: h2 が 2 個未満の記事は TOC 非表示

## 設計判断

| 項目       | 決定                                                                                  | 根拠                                          |
| ---------- | ------------------------------------------------------------------------------------- | --------------------------------------------- |
| 見出し抽出 | `@lexical/headless` + `editor.read()` + `$isHeadingNode`                              | 公式推奨                                      |
| ID 付与    | カスタム `HeadingNode` + NodeState `anchorIdState`（`flat: true`） + Node Replacement | 公式パターン、JSON persist                    |
| ID 再計算  | Node Transform（textContent 変更で再計算、重複は `-1`/`-2`）                          | 公式 Node Transforms 推奨                     |
| 対象見出し | h2 + h3                                                                               | SWELL 慣習、公式 TableOfContentsPlugin と一致 |
| Desktop UI | `ArticleLayout` 新 `toc` sidebar slot（sticky + 自前 2-col grid）                     | BlogLayout widget 枠は不適                    |
| Mobile UI  | 本文冒頭 `<details>` 折りたたみ                                                       | sidebar は末尾スタックで無意味                |
| scroll-spy | `IntersectionObserver` + React 19 純粋関数                                            | React Compiler 自動メモ化                     |
| 対象ページ | posts / news のみ                                                                     | Terms は後続タスク                            |
| HTML 生成  | `headless-renderer.ts`（既存） + 新 `extractHeadings()` 関数                          | 責務分離                                      |

## 破壊的変更

1. **admin `TableOfContentsNode` 削除**（エディタ内目次機能廃止）
2. **`HeadingNode` → `CustomHeadingNode` Node Replacement**（anchorId を JSON persist）
3. **`scroll-utils.ts` 移動**: `(public)/reservation/_components/scroll-utils.ts` → `(public)/_shared/lib/scroll.ts`
4. **`ArticleLayout` props 変更**: `toc?: ReactNode` slot 追加、内部レイアウトを BlogLayout 依存から独自 2-col grid に置換（posts/news 詳細のみ）
5. 既存 posts/news の `contentJson` は次回編集時に lazy migration（Node Transform が自動 ID 付与）

## タスク構成

### Phase 1: Lexical ノード層（密結合 — 1 implementer バンドル）

**タスク 1-1〜1-3**: `CustomHeadingNode` + Node Transform + ノード登録

- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/CustomHeadingNode.ts`（新規）
  - `extends: HeadingNode` で Node Replacement
  - `anchorIdState = createState("anchorId", { parse: parseString })` (`flat: true`)
  - `createDOM` / `updateDOM` / `exportDOM` で `id` 属性出力
  - `importDOM` で既存 h1-h6 タグから ID 読み取り
  - ファクトリ `$createCustomHeadingNode(tag, anchorId?)`、型ガード `$isCustomHeadingNode`
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/register-heading-anchor-transform.ts`（新規）
  - `editor.registerNodeTransform(CustomHeadingNode, ...)` で textContent → slug、重複は document 内 counter で `-1`/`-2` 付番
  - 空文字列や重複のときのみ再計算（無限ループ防止）
- `config/nodes.ts`: `{ replace: HeadingNode, with: (node) => $createCustomHeadingNode(node.getTag()), withKlass: CustomHeadingNode }` を追加、`TableOfContentsNode` を削除
- `LexicalEditor.tsx` / plugins wiring: Node Transform 登録、`TableOfContentsNode` 関連 import 削除
- `bun:test`: NodeState parse、createDOM、exportDOM で id 出力、Transform による ID 自動付与、重複解決

### Phase 2: サーバーサイド抽出 + slug helper 拡張（独立）

**タスク 2-1**: `generateSlug` 拡張

- `src/shared/lib/slug.ts`: 既存シグネチャ維持、新 export `generateUniqueSlug(text, usedSlugs: Set<string>)`（重複付番機能）
- `bun:test`: `usedSlugs` の連続呼び出しで `-1`, `-2` が付番されること

**タスク 2-2**: `extractHeadings()` 新設

- `src/shared/lib/lexical/extract-headings.ts`（新規）
  - `@lexical/headless` + 全 `EDITOR_NODES`（CustomHeadingNode 含む）
  - `editor.parseEditorState(contentJson)` → `editor.read()` で `$getRoot().getChildren()` 再帰 traverse
  - `$isCustomHeadingNode(node)` + `h2`/`h3` のみ抽出
  - 戻り値: `readonly { id: string; text: string; level: 2 | 3 }[]`
  - SSR-safe（DOM 非依存、`parseEditorState` のみ使用）
- `preview/headless-renderer.ts`: `CustomHeadingNode` を nodes 配列に追加（ID 属性が HTML に反映される）
- `bun:test`: JSON → 抽出結果、空文字 ID のフォールバック、h4 以下は除外

### Phase 3: スクロールユーティリティ移動（独立）

**タスク 3**: `scroll-utils.ts` 移動

- `src/app/(public)/_shared/lib/scroll.ts`（新規、reservation から移動）
- `getScrollBehavior()` / `scrollToElement()` をそのまま移植
- 旧パスの全 import を Grep で検出し一括置換
- `bun:test`: 既存テストを移動 + reduced-motion 分岐

### Phase 4: TOC コンポーネント（タスク 2 完了後）

**タスク 4-1**: Server / Client TOC コンポーネント

- `src/app/(public)/_shared/components/article/article-table-of-contents.tsx`（Server Component）
  - props: `headings: readonly { id; text; level }[]`, `variant: "sidebar" | "mobile"`
  - sidebar variant: `<nav aria-label="目次" className="sticky top-[calc(var(--header-height)+2rem)] max-h-[calc(100svh-var(--header-height)-4rem)] overflow-y-auto">`
  - mobile variant: `<details className="...">` + `<summary>` 冒頭配置
  - list は `<ol>` + indent（h3 は `pl-4`）
  - `<ArticleTableOfContentsScrollSpy headings={headings} />` を子として埋め込み（sidebar のみ）
- `article-table-of-contents-scroll-spy.tsx`（Client Component）
  - `IntersectionObserver` で `#id` を監視、`aria-current="location"` を active 見出しに付与
  - クリック時は `scrollToElement(id)` で header-aware smooth scroll
  - `prefers-reduced-motion` は `scrollToElement` 側で処理済み
  - React 19: `useCallback` / `useMemo` 不使用、`useEffect` + clean-up のみ
- `bun:test`: heading 数 0/1 で null 返却、2+ で render、sidebar/mobile variant 出し分け

### Phase 5: ArticleLayout 改修（タスク 4 完了後）

**タスク 5**: `ArticleLayout` に `toc` slot 追加

- `toc?: ReactNode` prop 追加
- `toc` 指定時は BlogLayout をバイパスして独自 2-col grid（`lg:grid lg:grid-cols-[1fr_280px] lg:gap-16`）
- `toc` 未指定時は従来どおり BlogLayout 経由
- mobile TOC は記事冒頭（`<article>` 内の `<header>` 直後）に挿入するため、`mobileToc?: ReactNode` も追加
- posts / news 以外の既存利用箇所（preview 等）は影響なし

### Phase 6: 公開ページ組み込み（タスク 5 完了後）

**タスク 6**: posts / news page.tsx で heading 抽出 + ArticleLayout に渡す

- `src/app/(public)/posts/[...segments]/page.tsx` / `src/app/(public)/news/[slug]/page.tsx`
- 記事取得後 `extractHeadings(post.contentJson)` を呼ぶ（`'use cache'` ではない通常の async 関数内で）
- 閾値チェック: h2 数 `< 2` なら TOC を渡さない
- `<ArticleLayout toc={headings.length >= 2 ? <ArticleTableOfContents variant="sidebar" headings={headings} /> : undefined} mobileToc={...}>`
- 公開 HTML は既存 `contentHtml` をそのまま使用（Node Transform が ID を付与したあと再保存されたもの）

### Phase 7: admin 側 TableOfContentsNode 削除（並行実行可）

**タスク 7**: admin 全関連ファイル削除

- `nodes/TableOfContentsNode.tsx` 削除
- `nodes/index.ts` barrel 削除
- `config/nodes.ts` から `TableOfContentsNode` 削除
- `config/dialog-registry.ts` / `config/insert-items.ts` / `config/inspector-registry.ts` から削除
- `inspector/hooks/inspectable-nodes.ts` / `inspector/InspectorSidebar.tsx` / `inspector/panels/` 関連削除
- 挿入メニューから「目次」エントリ削除
- `__tests__/unit/.../inspectable-nodes.test.ts` カウント更新

### Phase 8: E2E テスト

**タスク 8**: Playwright 認証済みテスト

- `e2e/authenticated/customer/article-toc.spec.ts`（新規）
  - seed の公開 post を開き、TOC 表示確認
  - 見出しクリック → スクロール確認
  - mobile viewport: `<details>` open/close
  - reduced-motion: `behavior: "instant"` 確認

### Phase 9: 最終検証

**タスク 9**: 全体検証

- `bun run validate && bun run build`
- `bun run test:unit && bun run test:integration`
- `bun run e2e` (chromium-customer project)
- dev サーバーで manual 確認（posts/news 詳細、`prefers-reduced-motion`、モバイル幅）

## ファイル一覧

### 新規

- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/CustomHeadingNode.ts`
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/register-heading-anchor-transform.ts`
- `src/shared/lib/lexical/extract-headings.ts`
- `src/app/(public)/_shared/lib/scroll.ts`
- `src/app/(public)/_shared/components/article/article-table-of-contents.tsx`
- `src/app/(public)/_shared/components/article/article-table-of-contents-scroll-spy.tsx`
- `__tests__/unit/lexical/custom-heading-node.test.ts`
- `__tests__/unit/lexical/heading-anchor-transform.test.ts`
- `__tests__/unit/lexical/extract-headings.test.ts`
- `__tests__/unit/lib/slug.test.ts`（`generateUniqueSlug` 追加）
- `e2e/authenticated/customer/article-toc.spec.ts`

### 編集

- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/config/nodes.ts`
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/LexicalEditor.tsx`（Transform 登録）
- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/preview/headless-renderer.ts`
- `src/app/(public)/_shared/components/layouts/article-layout.tsx`
- `src/app/(public)/posts/[...segments]/page.tsx`
- `src/app/(public)/news/[slug]/page.tsx`
- `src/shared/lib/slug.ts`
- reservation 配下の `scroll-utils.ts` 参照元すべて

### 削除

- `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/nodes/TableOfContentsNode.tsx`
- `src/app/(admin)/.../inspector/panels/TableOfContentsInspectorPanel.tsx`（存在すれば）
- `src/app/(public)/reservation/_components/scroll-utils.ts`

## 検証ゲート

- Phase 1 後: admin エディタで新規記事作成 → h2 追加 → dev tools で `<h2 id="...">` 確認
- Phase 2 後: `__tests__/unit/lexical/extract-headings.test.ts` green
- Phase 5 後: posts/news 既存記事で（ID 未付与 contentHtml の場合）TOC 非表示であること確認、再保存で TOC 表示
- Phase 9: 全検証コマンド green

## リスク

- 既存 posts/news の `contentHtml` は id 未付与のため、anchor クリックが効かない。**再保存するまで lazy migration**（Node Transform が次回編集時に発動）。緊急反映用の `scripts/regenerate-post-html.ts` は本計画対象外（別タスク）
- Turbopack HMR: `EDITOR_NODES` 変更後は dev サーバー再起動必要

## 参考

- Lexical NodeState API: https://lexical.dev/docs/concepts/nodes
- `@lexical/headless`: https://lexical.dev/docs/packages/lexical-headless
- Node Transforms: https://lexical.dev/docs/concepts/transforms
- React 19 Compiler: `.claude/rules/react-patterns.md`
- プロジェクト Lexical 慣習: `.claude/rules/frontend/lexical-patterns.md`
