---
description: Lexical ファイル命名規則・HTML互換性・禁止事項・Gotchas
paths:
  - "src/shared/lib/lexical/**"
  - "src/**/editor/**"
  - "src/**/*lexical*"
  - "src/app/(admin)/**/lexical/**"
---

# Lexical 規約・禁止事項・Gotchas

## ファイル命名規則

| 種類       | 命名              | 例                  |
| ---------- | ----------------- | ------------------- |
| ノード     | `XxxNode.tsx`     | `CalloutNode.tsx`   |
| プラグイン | `XxxPlugin.tsx`   | `CalloutPlugin.tsx` |
| 型定義     | `types.ts` に追加 | -                   |

## HTML互換性

`exportDOM` と `importDOM` はセットで実装が必須（片方のみで dev-mode に警告が出る）:

- `exportDOM()`: エディタ状態 → HTML（クリップボード・公開ページ出力）
- `importDOM()`: HTML → エディタ状態（クリップボードペースト・再編集時）

### importDOM 実装パターン

```typescript
static override importDOM(): DOMConversionMap | null {
  return {
    div: (domNode) => {  // exportDOM が出力するタグ名
      if (!(domNode instanceof HTMLElement) || !domNode.hasAttribute("data-xxx"))
        return null;  // 別ノードの同タグは null を返してスキップ
      return {
        conversion: (element) => {
          const node = $createXxxNode({
            value: element.getAttribute("data-value") ?? "",  // getAttribute は string | null → ?? "" 必須
          });
          return { node };
        },
        priority: 2,  // div/figure/li 等の汎用タグをオーバーライドするために必須
      };
    },
  };
}
```

**`after: () => []`** — HTML の子要素を Lexical 子ノードとして取り込まない場合のみ使用:

```typescript
// NG: テキスト編集可能ノードに使用（子ノードが復元されなくなる）
// OK: 画像ノード等、子要素(<img>/<figcaption> 等)を Lexical 子ノードにしたくない場合のみ
return { node, after: () => [] };
```

## 禁止事項

1. **直接的なDOM操作禁止**: `editor.update()` / `editor.read()` を経由
2. **updateListener内での更新禁止**: パフォーマンス問題（Node Transforms使用）
3. **read/update混在禁止**: 同期的にネストしない
4. **メモリリーク**: リスナーは必ず `mergeRegister` で登録解除
5. **型アサーション禁止**: 型ガード関数 `$isXxxNode()` を使用
6. **制御コンポーネント化禁止**: EditorStateを親コンポーネントで管理しない
7. **LexicalErrorBoundary省略禁止**: RichTextPluginには必須（v0.36+ は named export: `{ LexicalErrorBoundary }`）
8. **プレースホルダーの渡し先を誤らない**: `RichTextPlugin` に `placeholder` を渡さない。`ContentEditable` に `placeholder` と `aria-placeholder` を渡す（[Lexical React の用法](https://lexical.dev/docs/getting-started/react)）
9. **`@lexical/utils` からの `mergeRegister` / `$findMatchingParent` import禁止**: v0.40.0で `lexical` 本体に移動。`import { mergeRegister } from 'lexical'` を使用
10. **レガシーノードパターン禁止**: `static getType()`, `static clone()`, `static importJSON()`, `exportJSON()`, `__property`, `getWritable()`, `getLatest()`, `$applyNodeReplacement`, `SerializedXxxNode` interface — すべて `$config` + `createState` + `$getState` / `$setState` に置換済み
11. **ブロックレベルノードへの `$insertNodes` 使用禁止**: `$insertNodeToNearestRoot` (`@lexical/utils`) を使用。`$insertNodes` はインライン/混合ノード専用
12. **React render内でのノードプロパティ直接アクセス禁止**: `editor.getEditorState().read(() => $getState(node, xxxState))` で囲む。Lexicalはアクティブなeditor stateが必要
13. **`node.__property` 直接アクセス禁止**: `$getState(node, xxxState)` を使用。`__` フィールドは `$config` で自動管理
14. **ノードクラスに getter/setter ラッパー定義禁止**: `node.getText()` / `node.setText(v)` ではなく `$getState(node, textState)` / `$setState(node, textState, v)` を直接使用。ラッパーメソッドは後方互換性ハックであり CLAUDE.md §禁止事項に違反
15. **子ノードの collapseAtStart 委譲禁止**: Title/Content/Panel 等の子ノードに `collapseAtStart()` を実装しない。`isShadowRoot()` で境界保護する。コンテナノードのみが `collapseAtStart()` を持つ
16. **コンテナ/コンテンツノードの isShadowRoot 省略禁止**: 複合ノードのコンテナ・コンテンツ・パネルノードには必ず `isShadowRoot() { return true }` を実装する
17. **CSS クラス使用禁止（createDOM / exportDOM 共通）**: `createDOM` / `exportDOM` では `config.theme.*` も CSS クラスも一切使用しない。data-attributes のみで DOM を構築する。CSS は `lexical-content.css` のアトリビュートセレクタで対応。`createDOM` のシグネチャは `override createDOM(_config: EditorConfig): HTMLElement`（未使用でも `_config` 必須）
18. **updateDOM で `return true` の乱用禁止**: 属性変更は `$getStateChange` + `dom.setAttribute()` で差分更新し `return false`。`return true` は DOM 要素タグの変更等、DOM 再構築が必要な場合のみ
19. **AccentColor スウォッチ値と CSS トークン値の不一致禁止**: `lexical-content.css` の `[data-color]` `--accent` 値が **canonical**。`ACCENT_COLOR_SWATCHES`（`accent-colors.ts`）はその値をミラーするため、CSS 変更時は TS 側も必ず更新すること。Preview（ColorSwatchPicker）と実際の適用色が乖離するためユーザー混乱の原因になる
20. **インライン DecoratorNode 挿入時の選択テキスト削除漏れ禁止**: `$insertNodes` でインラインノードを挿入する前に RangeSelection がある場合は `selection.removeText()` を呼ぶ。未呼出の場合、選択テキストが残存したまま挿入される

```typescript
// OK パターン（Ruby / Tooltip 等のインライン挿入）
editor.update(() => {
  const selection = $getSelection();
  if ($isRangeSelection(selection)) {
    selection.removeText(); // ← 必須: 選択テキストを先に削除
  }
  $insertNodes([$createRubyNode(baseText, rubyText)]);
});
```

21. **`TableCellResizerPlugin` は @lexical/react 0.43.x に存在しない**: 使用禁止。`<TablePlugin hasCellMerge={true} hasCellBackgroundColor={true} />` が現バージョンのテーブル強化の上限
22. **`exportDOM` 定義時に `importDOM` 省略禁止**: `exportDOM` を定義したすべてのノードは `static override importDOM(): DOMConversionMap | null` も必ず実装する。省略すると Lexical dev-mode が `exportDOM implemented without matching importDOM` を警告し続ける
23. **組み込みノード（TableNode 等）を継承する場合は Node Replacement パターン必須**: 独自型文字列（`"custom-table"`）を持つカスタムノードと `{ replace: TableNode, with: factory, withKlass: CustomTableNode }` をセットで `EDITOR_NODES` に登録する。`withKlass` が `editor._nodes.get("table")` に `CustomTableNode` を登録するため `TablePlugin.hasNodes([TableNode])` が通過し、`$isTableNode(customTableNode)` も `instanceof` で `true` になる。親の型文字列をそのまま使う手法（`this.config("table", ...)`）は公式パターン外であり禁止
24. **`updateDOM` の `prevNode` に具象型使用禁止** — `prevNode: CalloutNode` ではなく `prevNode: this` を使用。公式パターン準拠かつ継承時の型安全性を確保する
25. **`$getStateChange` の truthy チェック禁止** — `if (change)` ではなく `if (change !== null)` を使用。公式ドキュメントと一致させる
26. **常に `false` を返す `updateDOM` に `boolean` 戻り型禁止** — 引数なし・常に `return false` のメソッドは `override updateDOM(): false` とリテラル型で宣言する。DecoratorNode や状態を持たない子ノードが該当
27. **`contentWidthClassName` / `contentWidthStyle` 禁止（削除済み）** — `contentWidth?: number`（テキスト領域の純粋な幅 px）を使用。エディタ内部で `EDITOR_PADDING_HORIZONTAL`（64px）を加算。`useContentWidth` フック → `resolveWidthStyles().px`
28. **Route Handler での `$generateHtmlFromNodes` 使用禁止** — DOM API 不在で 500 エラー。プレビュー HTML はクライアント側の `renderEditorStateJsonToHtmlClient` で生成。保存時は Server Actions の `renderEditorStateToHtmlLazy`（動作する）

## Gotchas

- **単一レベルコンテナ（CalloutNode, GroupNode）に `isShadowRoot` 禁止** — `isShadowRoot` はコンポジットノード（Collapsible/Steps/Tabs/Layout 等の Title/Content 内部構造を持つもの）専用。単一レベルコンテナに追加するとカーソルが閉じ込められ `$onEscape` で段落挿入が必要になる。Lexical のデフォルト矢印キー動作で自然に脱出できる
- **`MobileEditorFallback`（画面幅 &lt; 1024px）** — 親から渡された **`contentJson` を headless で HTML に変換**してプレビューする（未保存の変更を反映）。**`lexicalJsonSchema` 非適合時はプレビューせず警告**（自動正規化しない）。`EMPTY_LEXICAL_EDITOR_STATE_JSON` は **空段落 1 ブロック**。DB 修正は `docs/how-to/fix-legacy-lexical-rows.md`。headless 変換は `parseEditorState` のあと **`editor.setEditorState(editorState)`** を挟んでから `$generateHtmlFromNodes` すること（省略すると空 HTML になりうる）。実装: `preview/render-editor-state-to-html-client.ts` / サーバー側は `preview/headless-renderer.ts`
- **`createDOM` → data-attribute 変換後は `theme.ts` の旧エントリを削除** — `config.theme.*` 参照除去後、`theme.ts` に残った CSS クラスエントリが dead code になる。変換時にセットで削除する
- **`createEnumGuard` の型ガードは `string` を要求** — `createEnumGuard` が返す関数は `(value: string) => value is T` シグネチャ。`parse: (v: unknown)` から直接渡すと型エラー。AccentColor 等の parse パターン: `parse: (v: unknown): AccentColor => typeof v === "string" && isAccentColor(v) ? v : "default"`
- **`importDOM` で `getAttribute()` → AccentColor 変換に型ガード必須** — `element.getAttribute("data-color") ?? "default"` の型は `string`（`AccentColor` ではない）。必ず `isAccentColor(colorAttr) ? colorAttr : "default"` でガードする
- **テーブルセル内の `mb-4` が余分な縦幅を生む** — HTML 仕様でテーブルセル内はマージン相殺が起きず、`ParagraphNode` の `mb-4`（16px）がそのまま余白になる。`lexical-content.css` に `table :is(td, th) > :last-child { margin-bottom: 0; }` を追加（unlayered CSS は Tailwind utilities より優先）
- **`theme.ts` の `w-full` と `fixedLayout` state は競合する** — テーマクラスの `w-full` がインライン style による `fixedLayout` 制御を上書きする。テーマから `w-full` を削除し、幅制御は `CustomTableNode._applyAttributes()` の `fixedLayout` state に一本化すること
- **constructor 必須引数を持つ組み込みノード拡張時は `new CustomNode(arg)` 直接使用** — `$create(Klass)` は引数を渡せず `__tag` 等 private フィールドが undefined になる。`(node as unknown as { __tag }).__tag = tag` で後付けするのは型アサーション禁止違反。Lexical 公式 `$createHeadingNode` も `new HeadingNode(tag)` パターンを採用（`@lexical/rich-text`）。`CustomHeadingNode` / `CustomTableNode` が参照実装
- **`registerNodeTransform` コールバック引数は公式型 `(node: T) => void` に準拠** — document 全体を走査して重複解決する等で引数を使わない場合でも `(_node: T) => {...}` で明示する（TypeScript の parameter omission で実行時は動くが、型要件明示がクリーン）
- **Node Transform の fallback 値は deterministic 必須** — `crypto.randomUUID()` / `Math.random()` 等ランダム値を transform 内で生成すると、再実行ごとに別値 → `$setState` 差分検出 → 再び dirty で無限ループ。`used.size + 1` や position ベースの deterministic fallback を使う（例: `section-${used.size + 1}`）。`HeadingAnchorPlugin` 参照実装
- **Prisma JSON フィールドは headless 外でも JSON 直接 traverse が可能** — `@lexical/headless` + `createHeadlessEditor` は Node 環境で動くが全ノード登録が必要。公開側の単純な heading 抽出等は **`contentJson` を JSON.parse して再帰 traverse**（`unknown` 受付）する方が軽量。`extractHeadings` (`@/shared/lib/lexical/extract-headings`) が参照実装

### createDOM と exportDOM のタグ不一致は許容される

`createDOM`（エディタ内レンダリング用）と `exportDOM`（HTML出力用）が異なるタグを使ってもよい:

- Lexical のクリップボードは **`exportDOM` の HTML を使用**（`createDOM` の DOM はクリップボードに使われない）
- 内部コピペは JSON パス（`exportJSON`/`importJSON`）→ `importDOM` は `exportDOM` 出力タグに合わせる

## Gotchas

- **Lexical ノード serialization 変更の migration は 6 テーブル全網羅必須** — Lexical contentJson は **`news` / `news_versions` / `posts` / `post_versions` / `sections` / `terms_documents`** の 6 テーブルに分散保存される。新ノード型追加 / 既存ノード state field rename / discriminator union 拡張 / value shape 変更時、PL/pgSQL 再帰関数で `children` 配列を walk + 全 6 テーブルに `UPDATE ... SET contentJson = transform(contentJson) WHERE contentJson IS NOT NULL` を流す。1 テーブル漏れると post 編集 → 公開 stale / news version 履歴で不整合 / draft 復元時に旧形式が混入する silent bug の温床。検出 grep: `grep -nE "contentJson\s+Json" prisma/schema.prisma` で網羅確認（`schema.prisma` 編集時は必ず実行）。参照実装: `prisma/migrations/20260508162253_lexical_button_rich_label/migration.sql`（Phase 5 ButtonNode rich label refactor、`text → label tokens (_key UUID 付き)` + `outline → editorial` rename + `color: "default"` 自動付与）
- **Lexical フルスクリーンには 2 種の実装** — ① `InlineEditorShell` (Posts/News/Terms): `useFullscreenMode()` で admin-layout-context の `enterFullscreen`/`exitFullscreen` を呼びサイドバー/ヘッダーを非表示にする（local overlay 不要） ② `LexicalEditor` 内部 `isFullscreen` state (Events/Spaces/Pages 等の tab/dialog 内): `fixed inset-0` + inline `style={{ zIndex: Z_INDEX.editorFullscreen }}` overlay。どちらも z-index は **inline style 必須** — ``className={`z-[${VAR}]`}`` は Tailwind JIT が scan しないため CSS 未生成の silent bug（→ `tailwind-patterns/inline-style-vs-arbitrary.md`）。InlineEditorShell なしで editor を使う tab/dialog では後者のみ動作するため、新規 editor 配置時は fullscreen が overlay z-index に依存することを意識する
- **Lexical は既に dynamic import 済み** — `LazyLexicalEditor.tsx` が `next/dynamic` + `ssr: false` でコード分割。管理 layout には Lexical の直接 import なし。パフォーマンスレビューで「Lexical がバンドル肥大化」と指摘された場合は `LazyLexicalEditor` の存在を確認してから対応判断
- **admin.css の `--font-serif` は Lexical WYSIWYG 用** — エディタ内の h1/h2 を公開ページと同じ Cormorant Garamond で表示するため。admin layout.tsx で Cormorant Garamond をロード、`theme.ts` の h1/h2 に `font-heading` 適用。管理 UI（サイドバー、フォーム等）は `--font-sans` のまま
- **Lexical エディタのコンテンツ領域は `bg-card`（白）** — `bg-background`（`oklch(0.98 ...)` 微グレー）ではなく `bg-card`（`oklch(1 0 0)` 白）を使用。文書編集エリアは紙のメタファーで白背景が適切。`LexicalEditor.tsx` の外枠 div で設定
- **Lexical ツールバーはエディタ+インスペクターの全幅に配置（Gutenberg パターン）** — ツールバーを `section` の外に出し、外枠 `div.flex-col` の直下に配置。コンテンツ+インスペクターは `div.flex.flex-1` で横並び。ツールバーがインスペクター開閉時にかぶらない。`LexicalEditor.tsx` で実装
- **`tryConvertHtmlStringToLexicalJsonString` は SSR で使用不可** — `DOMParser` が Node.js に存在しない。Server Component / Server Action から呼ぶと `Attempted to call client function from the server` エラー。`useState` 遅延初期化で呼ぶ場合も `typeof window === "undefined"` ガードが必須（SSR でも実行されるため）
- **複合ノードの `isShadowRoot()` は全子ノードに必須** — Container だけでなく Item / Title / Content / Panel / Citation 等の全中間・子 ElementNode にも `isShadowRoot(): boolean { return true }` を実装する。欠落するとキャレットがノード境界を越えて漏れる。`updateDOM` の `prevNode` は具象クラス名ではなく `this` 型を使用
- **Lexical アップグレード時はバージョン参照を全文 grep** — `0.XX` で `.claude/agents/`, `.claude/skills/`, `docs/`, `__tests__/`, ソースコメントを検索。CLAUDE.md・`frontend/lexical/*.md`（core / nodes / plugins / toolbar-layout / conventions）・TECH_STACK.md・project-reviewer.md・lexical-reviewer.md・scaffold ファイル・DraggableBlockPlugin フォークコメントが対象。plans/ の完了済みファイルは変更不要
- **Floating toolbar は `.editor-scroller` / `.editor` 二層構造 + 両方に `position:relative` が必須** — 公式 Playground (`src/index.css` L79-97 / `src/Editor.tsx`) は scroller（`overflow` + relative）と anchor（relative）を分離し、`anchorElem = .editor` を各 floating plugin に渡す。`createPortal` の挿入先 `anchorElem` に relative が欠けると `position:absolute` がビューポート基準化し上部ツールバーに重なる silent bug。`setFloatingElemPosition` の top 境界判定は **`editorScrollerRect.top`**（= `anchorElem.parentElement`）を使う必要あり — `anchorElementRect.top` はスクロール時に負値化して判定不能。text-align: right/end のときは `targetRect.right - toolbarWidth + offset` で right-edge 基準 left 配置。参照実装: `LexicalEditor.tsx` の `contentWrapperRef`（scroller）+ `contentWidthRef`（anchor）、`floating-toolbar/positioning.ts` が公式 `setFloatingElemPosition` と完全一致
- **Lexical 公式 API に Group / Container の native 概念なし** — `@lexical/react` / `lexical-playground` にラッパー型ノード（複数の block を囲む汎用コンテナ）の reference 実装は存在しない。Group / Callout / Collapsible / PullQuote 等の「ブロック群を囲む」UX は **WordPress Gutenberg reference implementation 準拠** が一択。主張粒度は「Lexical 公式 API 準拠」ではなく **「Gutenberg reference implementation 準拠」** と明記（overstate 回避）。context7 の `/facebook/lexical` を延々と探さず、`gh api repos/WordPress/gutenberg/contents/packages/block-library/src/group/` を直接参照する
- **Portable Text editor (`PortableTextInlineEditor` / `PortableTextBlockEditor`) は Lexical 不使用 — 責務分離原則** — 2 つの portable-text editor は `_shared/components/portable-text/{inline-editor,block-editor}/` 配下にあるが、内部実装は `contenteditable` div + DOM walker (`serialize-spans.ts` / `serialize-blocks.ts`) で Lexical は import しない。Sanity Portable Text 公式 Span / Block model (`{_key, _type, ...}`) の最小実装で SSR safe + dynamic import 不要 + bundle 軽量。Section の inline label / long-form text 専用 editor として `field.portableTextInline` (Phase 1-3 / span 配列) / `field.portableTextBlock` (Phase 4 / block 配列) で配線され、`AutoSectionForm` の `case "portable-text-inline"` / `case "portable-text-block"` 分岐から呼ばれる。Lexical エディタは Post / News / Terms / Section.contentJson の rich content 編集に限定（6 テーブル分散保存）。**両者の責務分離**: ① 短い label / 長文 textarea 相当 → portable-text editor（軽量 contenteditable） ② full WYSIWYG / heading / list / table / image / 各種カスタムノード → Lexical。Portable Text editor を Lexical wrapper 化する提案は本責務分離違反のため拒否（Phase 4 plan 作成時の "Lexical wrapper" 文言は誤認識、実装は contenteditable パターンで統一）
