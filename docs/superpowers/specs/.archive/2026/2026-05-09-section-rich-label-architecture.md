# Spec: 全テキストフィールドを Portable Text に統一（Clean Break）

> **Snapshot: 2026-05-09** — Phase 0-4 全 implementation completed, archived as historical reference.
>
> **Phase 5 retract (2026-05-09)**: 本 spec line 442 が明記する通り「Lexical Editor 系の Post / News / Terms 本文（既に Lexical で rich text 化済、それ自体は変更なし）」。一時的に Phase 4 plan が「Phase 5 で別 plan」と仮置きしたが、(1) 元 spec に Phase 5 記述なし、(2) `.claude/rules/frontend/lexical/conventions.md` の責務分離原則「full WYSIWYG → Lexical / 短い label・段落 → Portable Text」、(3) Lexical 46 custom nodes + 61 plugins の規模、により Phase 5 は廃止。Lexical エコシステムは Post/News/Terms/Space/Event の contentJson 編集に限定維持で確定。
>
> **方針**: 破壊的変更 OK / 後方互換なし / 公式 Portable Text 準拠 / クリーン実装単一 path

## 背景

直近の作業で以下が token 配列モデル（`ButtonLabelToken[]`、`{_key, type:"text", value} | {_key, type:"icon", name}`）に rich label 化された:

- `Section.config.buttons[].label` — cta / hero / hero-parallax / page-hero
- `NavigationItem.label` — ヘッダー / フッターメニュー

このモデルは Sanity Portable Text の **inline-only サブセット**として導入されたが、命名（`type` vs 公式 `_type`）と命名語彙（`ButtonLabelToken` vs 公式 `PortableTextSpan`）が独自であり、長文 textarea には対応していない。

本 spec では全 Section テキストフィールドを **公式 Portable Text 準拠の単一モデル**に統合する。既存の `buttonLabelSchema` も同モデルに移行し、コードベース全体で token model 1 系統に固定する。後方互換 layer を一切持たず、命名と schema を Sanity Portable Text v1 に揃える。

## 公式準拠の根拠

- **Portable Text 公式仕様**: https://github.com/portabletext/portabletext / https://www.portabletext.org/
- **Sanity Studio**: ヘッドレス CMS 業界標準、Block Content として採用
- **Lexical**: Meta 製公式 React Editor（本プロジェクトで Post/News/Terms に既採用済）
- 仕様準拠点:
  - `_type` field 命名（discriminator は underscore prefix）
  - `_key` UUID（配列要素の stable identity）
  - block (`_type:"block"`) + children (`_type:"span"` / 任意 inline object)
  - block 内 `style: "normal" | "h1" | "h2" | ... | "blockquote"` で段落種別

## ユーザー要望

- 「公開ページにアイコンが表示されるように」（管理画面 UI 装飾ではなく公開描画）
- 「セクションすべて調べて」（全 22 セクション対象）
- 「破壊的変更 OK / 後方互換なし / 公式ベストプラクティス推奨 / クリーン実装」

## スコープ

22 セクション × フィールド種類で `string` / 旧 `ButtonLabelToken[]` を **Portable Text 単一モデル**に統合する。

| 群                            | フィールド例                                                                         | 推定数 | 公開描画                | データ型 (新)         | Phase   |
| ----------------------------- | ------------------------------------------------------------------------------------ | ------ | ----------------------- | --------------------- | ------- |
| **A0: 既存 buttons / nav**    | `buttons[].label`, `NavigationItem.label`                                            | 〜30   | `<Button>` / `<a>` 内   | `PortableTextSpan[]`  | Phase 0 |
| **A1: 見出し系**              | title, heading, label, tagline                                                       | 〜30   | `<Heading>` + SplitText | `PortableTextSpan[]`  | Phase 1 |
| **A2: items[] 見出し**        | features.items[].title, testimonial.items[].authorName, faq-list.items[].question 等 | 〜10   | カード内 h3/h4          | `PortableTextSpan[]`  | Phase 2 |
| **B1: リンク/ボタンテキスト** | viewAllText, submitButtonText                                                        | 〜6    | `<a>` / `<button>` 内   | `PortableTextSpan[]`  | Phase 3 |
| **C1: 長文 textarea**         | subtitle, description, body, content, items[].description, items[].answer, address   | 〜15   | `<p>` 段落              | `PortableTextBlock[]` | Phase 4 |

**対象外**:

- `sectionLabel` / `eyebrow`: `<SectionLabel>` のゴールドライン装飾 + 短い英字 uppercase なのでアイコン併記は冗長
- `embedCode` (HTML/iframe), `containerClass` (CSS class), `defaultSpaceId` (UUID) — 技術系
- `alt` / `caption` (画像 a11y) — テキストのみ意味あり
- `viewAllUrl` 等の URL 系 — string のまま

## データモデル（Portable Text 単一 SSoT）

### Span（inline、token 単位）

```typescript
// @/shared/lib/portable-text/schema.ts (新規 SSoT)

import { z } from "zod";

const tokenKeySchema = z.string().min(1);

/** Span: テキスト or インライン icon の最小単位 */
export const portableTextSpanSchema = z.discriminatedUnion("_type", [
  z.object({
    _key: tokenKeySchema,
    _type: z.literal("span"),
    text: z.string().max(500),
    // 将来拡張: marks: z.array(z.enum(["strong", "em", "underline"])).default([])
  }),
  z.object({
    _key: tokenKeySchema,
    _type: z.literal("iconInline"),
    name: z
      .string()
      .min(1)
      .max(64)
      .regex(/^Icon[A-Z][A-Za-z0-9]*$/),
  }),
]);

export type PortableTextSpan = z.infer<typeof portableTextSpanSchema>;
```

### Block（block-level、段落単位）

```typescript
/** Block: 段落（spans の配列）。将来 style 拡張で h2/h3/blockquote 等を追加可能 */
export const portableTextBlockSchema = z.object({
  _key: tokenKeySchema,
  _type: z.literal("block"),
  style: z.enum(["normal"]).default("normal"),
  children: z.array(portableTextSpanSchema).max(200),
});

export type PortableTextBlock = z.infer<typeof portableTextBlockSchema>;
```

### Schema factories（用途別の制約値）

```typescript
/**
 * Inline Span 配列（短いラベル / 見出し / リンクテキスト用）。
 * `safeParse({})` で `[]` フォールバック契約。
 */
export function createSpanArraySchema(opts: {
  maxSpans?: number;
  maxCharsPerSpan?: number;
}) {
  // span 内 text の max 制約と配列全体の max を opts で制御
  // 既定: maxSpans=50, maxCharsPerSpan=200
}

/**
 * Block 配列（長文 textarea 用）。
 * `safeParse({})` で `[]` フォールバック契約。
 */
export function createBlockArraySchema(opts: {
  maxBlocks?: number;
  maxSpansPerBlock?: number;
}) {
  // 既定: maxBlocks=50, maxSpansPerBlock=200
}
```

### 旧 `ButtonLabelToken` の廃止

`@/shared/lib/sections/definitions/_shared/button-label.ts` を完全削除。下記を `@/shared/lib/portable-text/schema.ts` の `PortableTextSpan[]` に置換:

- `buttonLabelSchema` → `createSpanArraySchema({ maxSpans: 50, maxCharsPerSpan: 200 })`
- `ButtonLabelToken` 型 → `PortableTextSpan`
- `TextToken` / `IconToken` → 廃止（Span discriminated union で表現）
- `createTextToken(value)` → `createSpan(text)`
- `createIconToken(name)` → `createInlineIcon(name)`
- `labelToPlainText(tokens)` → `spansToPlainText(spans)` (`@/shared/lib/portable-text/text.ts` に移管)
- `isTextToken` / `isIconToken` → 廃止（`_type === "span"` / `_type === "iconInline"` で narrow）

### Factory helpers（新 SSoT）

```typescript
// @/shared/lib/portable-text/factory.ts

export function createSpan(text: string): PortableTextSpan {
  return { _key: crypto.randomUUID(), _type: "span", text };
}

export function createInlineIcon(name: string): PortableTextSpan {
  return { _key: crypto.randomUUID(), _type: "iconInline", name };
}

export function createBlock(children: PortableTextSpan[]): PortableTextBlock {
  return {
    _key: crypto.randomUUID(),
    _type: "block",
    style: "normal",
    children,
  };
}

export function spansToPlainText(spans: PortableTextSpan[]): string {
  return spans.map((s) => (s._type === "span" ? s.text : "")).join("");
}

export function blocksToPlainText(blocks: PortableTextBlock[]): string {
  return blocks.map((b) => spansToPlainText(b.children)).join("\n");
}
```

## Migration（data-preserving、すべて 1 SQL ファイル）

### Phase 0: 既存 token field 名 rename

旧 `{_key, type:"text", value}` → `{_key, _type:"span", text}` に DB 上で rename。
旧 `{_key, type:"icon", name}` → `{_key, _type:"iconInline", name}` に rename。

```sql
-- prisma/migrations/<ts>_portable_text_unify/migration.sql
-- Section.config.buttons[].label の各 token を rename
-- NavigationItem.label の各 token を rename
-- 詳細: jsonb_set + jsonb_agg + CASE で _type / text field 注入
```

`pgcrypto` 既存有効化済（`gen_random_uuid()` 利用可）。

### Phase 1-3: string → `PortableTextSpan[]`

```sql
-- 例: Section.config.title (string) → [{_key, _type:"span", text: <値>}]
UPDATE sections
SET config = jsonb_set(
  config,
  '{title}',
  jsonb_build_array(
    jsonb_build_object(
      '_key', gen_random_uuid()::text,
      '_type', 'span',
      'text', config->>'title'
    )
  )
)
WHERE jsonb_typeof(config->'title') = 'string';
```

各 Phase で対象フィールドを列挙してまとめて変換。

### Phase 4: textarea (string with newlines) → `PortableTextBlock[]`

PL/pgSQL function で改行を保持したまま block 分割:

```sql
-- 例: description が "1 行目\n2 行目\n\n3 行目" なら 3 blocks (空行は無視 or 維持)
-- 各 block は children: [{_key, _type:"span", text: <line>}]
```

## 編集 UI

### 短いラベル系（Phase 0-3 / inline span）

既存 `RichLabelInput`（`@/admin/components/rich-label-input/RichLabelInput.tsx`）を改名 + リファクタ:

- 改名: `RichLabelInput` → `PortableTextInlineEditor`
- 内部の token field アクセスを `_type` / `text` / `name` に rename
- DOM `data-token` / `data-icon` 属性を `data-portable-type` / `data-portable-name` に統一
- ファイルパス: `@/admin/components/portable-text/inline-editor/`
- 保持機能: contenteditable + ツールバー「アイコン挿入」 + IconPickerDialog

### 長文 textarea（Phase 4 / block 配列）

**Lexical wrapper として実装**（業界標準・本プロジェクトで Post/News/Terms に既採用済の Lexical を流用）:

- ファイルパス: `@/admin/components/portable-text/block-editor/`
- Lexical の `RichTextPlugin` を base に、Section 専用に node セットを最小化:
  - `ParagraphNode`（既存）
  - `IconInlineNode`（新規 — `DecoratorNode` ベース、`<CuratedIcon>` を decorate）
- 出力: `Lexical EditorState (JSON)` → serialize → `PortableTextBlock[]`
- 入力: `PortableTextBlock[]` → deserialize → Lexical 初期 state
- ツールバー: 「アイコン挿入」のみ（Phase 4 では bold/italic 等の marks は未提供、将来拡張）
- 編集体験: Enter で新 block、Shift+Enter は span 内改行（または許可せず block 強制分割）

**理由**: contenteditable 自前実装は selection / IME / undo redo の完備に大きな保守責務、Lexical は正規化済 state model + 公式 plugin で boilerplate を削減できる。Post/News/Terms 既存採用との SSoT 統一にもなる。

### `field-registry.ts` API（破壊的変更）

```typescript
// 旧
field.text(label, opts);
field.textarea(label, opts);
field.richLabel(label, opts);

// 新（旧 text / textarea は対象フィールドで完全廃止、richLabel は portableTextInline に rename）
field.portableTextInline(label, opts); // PortableTextSpan[] (Phase 0-3)
field.portableTextBlock(label, opts); // PortableTextBlock[] (Phase 4)
```

`field.text` / `field.textarea` 自体は削除しない（URL や a11y `alt` 等の string 用途で残す）。対象フィールドの schema 定義のみ置換する。

`AutoSectionForm` の field 分岐に `case "portable-text-inline"` / `case "portable-text-block"` を追加。

## 公開描画

### 共有 SC: `<PortableTextSpans>` / `<PortableText>`

```tsx
// @/shared/components/portable-text/PortableTextSpans.tsx (新規、Server Component)

interface PortableTextSpansProps {
  readonly spans: PortableTextSpan[];
  readonly iconClassName?: string;
}

export function PortableTextSpans({
  spans,
  iconClassName,
}: PortableTextSpansProps) {
  return spans.map((span) =>
    span._type === "span" ? (
      <span key={span._key}>{span.text}</span>
    ) : (
      <CuratedIcon
        key={span._key}
        name={span.name}
        className={cn("inline-block align-[-0.125em]", iconClassName)}
      />
    ),
  );
}
```

```tsx
// @/shared/components/portable-text/PortableText.tsx (新規)

interface PortableTextProps {
  readonly blocks: PortableTextBlock[];
  readonly className?: string;
  readonly iconClassName?: string;
}

export function PortableText({
  blocks,
  className,
  iconClassName,
}: PortableTextProps) {
  return blocks.map((block) => (
    <p key={block._key} className={className}>
      <PortableTextSpans spans={block.children} iconClassName={iconClassName} />
    </p>
  ));
}
```

### 既存 `<TokenLabel>` の廃止

`@/shared/components/TokenLabel.tsx` を `<PortableTextSpans>` に置換 + 削除。consumer（Button / MagneticButton / site-header / site-footer / SortableNavItem 等）を全て新 SC に移行。

### `<SplitText>` 統合

A1 / A2 の見出しは `<Heading>` 内で `<SplitText>` による文字 split アニメ。Portable Text spans との両立:

```tsx
// @/public/components/animations/split-text.tsx に新 variant 追加

interface SplitTextSpansProps {
  readonly spans: PortableTextSpan[];
  // text span は char split、iconInline はそのまま inline 配置
}

<SplitTextSpans spans={config.title} />;
```

text span のみを文字単位 split し、icon span は char 分割対象外で inline 配置（DOM 順序保持）。GSAP の `mm.matchMedia` ガードは既存ロジックを維持。

各セクション公開コンポーネント（`HeroSection.tsx` / `CTASection.tsx` 等）の `<SplitText>{config.title}</SplitText>` を `<SplitTextSpans spans={config.title} />` に置換。

## ファイル構成（クリーン実装）

```
src/shared/lib/portable-text/             # 新規 SSoT
├── schema.ts                             # Span / Block schemas + factories（zod）
├── factory.ts                            # createSpan / createInlineIcon / createBlock
├── text.ts                               # spansToPlainText / blocksToPlainText
└── index.ts                              # barrel (型のみ re-export、関数 re-export 禁止)

src/shared/components/portable-text/      # 新規共有 SC
├── PortableTextSpans.tsx                 # inline span 配列の SC
└── PortableText.tsx                      # block 配列の SC（<p> ループ）

src/app/(admin)/admin/(dashboard)/_shared/components/portable-text/  # 新規管理 UI
├── inline-editor/
│   ├── PortableTextInlineEditor.tsx      # 旧 RichLabelInput をリネーム + 改修
│   └── serialize-spans.ts                # DOM ↔ PortableTextSpan[] 変換
└── block-editor/
    ├── PortableTextBlockEditor.tsx       # Lexical wrapper（ParagraphNode + IconInlineNode）
    ├── nodes/IconInlineNode.tsx          # DecoratorNode で <CuratedIcon> render
    ├── plugins/IconInlinePlugin.tsx      # ツールバー「アイコン挿入」
    └── serialize-blocks.ts               # Lexical EditorState ↔ PortableTextBlock[] 変換

src/shared/lib/sections/definitions/_shared/
├── button-label.ts                       # 削除
└── (buttonLabelSchema 関連は @/shared/lib/portable-text に統合)
```

## Phase 分割（破壊的、独立マージ可能）

各 Phase は単独でマージ可。前 Phase の data migration 適用後 dev / prod を移行できれば次 Phase に進む。

### Phase 0: 旧 `ButtonLabelToken` を Portable Text に rename

- 新 schema (`PortableTextSpan` / `PortableTextBlock`) 導入
- 旧 `buttonLabelSchema` / `ButtonLabelToken` / `createTextToken` / `createIconToken` 削除
- `_type` field 命名に統一、DB migration で全 token rename
- 既存 `RichLabelInput` を `PortableTextInlineEditor` にリネーム
- 既存 `<TokenLabel>` を `<PortableTextSpans>` にリネーム
- 影響: cta / hero / hero-parallax / page-hero の `buttons[].label` + NavigationItem.label
- 工数目安: 中（5-8 commits）

### Phase 1: A1 — 全セクション見出し系

- title / heading / tagline / label を `field.portableTextInline` 化
- migration: 全セクション 1 SQL ファイルで一括変換
- 公開描画: `<PortableTextSpans>` + SplitText 統合（`<SplitTextSpans>` 新 variant）
- 工数目安: 中（10-12 commits）

### Phase 2: A2 — items[] 内見出し

- features.items[].title, testimonial.items[].authorName/authorTitle, faq-list.items[].question, gallery.items[].caption, location-list の chapter 系等
- 各 items[] object schema 内フィールドを置換
- migration: jsonb path 操作で配列内 object key 変換
- 工数目安: 小〜中（5-7 commits）

### Phase 3: B1 — リンク/ボタンテキスト系

- viewAllText, submitButtonText
- 公開描画: `<a>` / `<button>` 内に `<PortableTextSpans>`
- 工数目安: 小（3-5 commits）

### Phase 4: C1 — 長文 textarea を Lexical block editor で

- `PortableTextBlockEditor` (Lexical wrapper) 新規実装
- `IconInlineNode` (DecoratorNode) 新規実装
- field-registry の `portableTextBlock` ヘルパー追加
- 対象フィールド (subtitle, description, body, content, address, items[].description, items[].answer) を置換
- migration: 改行 → block 分割
- 公開描画: `<PortableText>` で `<p>` ループ
- 工数目安: 大（15-20 commits）

## リスク

| リスク                                     | 影響                                      | 対策                                                                                 |
| ------------------------------------------ | ----------------------------------------- | ------------------------------------------------------------------------------------ |
| migration 失敗（壊れた jsonb）             | 公開ページ 500 / 404                      | dev で snapshot 検証 → prod 適用、`safeParse({})` フォールバック契約で defensive     |
| Phase 0 の rename で dev DB drift          | 同 worktree 内 dev server エラー連鎖      | migration 適用 worktree から dev server を再起動（CLAUDE.md gotcha §共有 dev DB）    |
| SplitText アニメ破壊                       | hero / cta の文字 split 無効化            | Phase 1 で `<SplitTextSpans>` を実 hero でテスト + Playwright e2e 追加               |
| Lexical の bundle 増加 (Phase 4)           | admin /pages/[slug]/edit の First Load JS | Lexical 既採用ルート (Post/News/Terms) と同等、影響軽微。dynamic import 維持         |
| seed.ts / fixture / rule docs 同時更新漏れ | CI 失敗 / next session 誤情報             | 各 Phase 末で `bun run validate` + `__tests__/unit/sections/*.test.ts` 全パス確認    |
| `_type` rename 後 stale 参照               | 旧 `type` field 名が残ると ts エラー      | grep `'\btype: "(text\|icon)"'` で残存検出 + 全 consumer を Phase 0 同 commit で更新 |
| Lexical IconInlineNode と SSR mismatch     | 編集中 / プレビューで DOM diff            | DecoratorNode の `decorate()` を Server-safe `<CuratedIcon>` で実装                  |

## 検証チェックリスト（Phase 単位）

- [ ] `bun run validate && bun run build` exit 0
- [ ] `__tests__/unit/sections/*.test.ts` 全パス
- [ ] `__tests__/unit/components/serialize-tokens.test.ts` を新 schema で書き直し
- [ ] `architecture-boundaries.test.ts` で旧 symbol が grep で残存しないこと検証
- [ ] seed.ts が新 schema で起動
- [ ] dev で `/` `/spaces` `/posts` `/access` `/contact` 描画確認（PageHero / Section の rich span 描画）
- [ ] `/admin/pages/home/edit` で `PortableTextInlineEditor` 編集 → 保存 → 再描画
- [ ] Phase 4 完了時 `/admin/pages/<slug>/edit` で `PortableTextBlockEditor` 編集 → block 追加 → icon 挿入 → 保存

## SSoT / rule docs 同時更新

各 Phase の commit で以下を同期:

- `.claude/rules/ssot-singletons.md` の「§Lexical / 記事表示」近辺に Portable Text SSoT エントリ追加（旧 ButtonLabelToken エントリは削除）
- `.claude/rules/frontend/admin-ui-patterns.md` に `field.portableTextInline` / `field.portableTextBlock` のパターン記述
- `.claude/rules/frontend/lexical/conventions.md` に `IconInlineNode` の DecoratorNode 慣例追記
- `.claude/rules/type-safety.md` に Portable Text の `_type` discriminated union パターン

## Out of Scope

- Lexical Editor 系の Post / News / Terms 本文（既に Lexical で rich text 化済、それ自体は変更なし）
- Block style 拡張（h2 / h3 / blockquote / list）— `style: "normal"` 単一で開始、将来拡張
- Span marks（**bold** / _italic_ / underline）— `marks: []` 維持で将来追加
- Image inline 挿入 — 別途 `field.image` で対応済
- Span / Block 単位の Server-side syntax highlight や Markdown 変換
- 多言語対応 / i18n
- DB の Json 列以外（Customer / User 等の string 列）の rich label 化

## 参照

- 公式 Portable Text 仕様: https://github.com/portabletext/portabletext
- 公式 Sanity Block Content: https://www.sanity.io/docs/block-content
- 公式 Lexical: https://lexical.dev/ + 本プロジェクト既採用 (`src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/**`)
- Migration 前例: `prisma/migrations/20260508162408_button_label_token_keys/migration.sql`（`pgcrypto` + `gen_random_uuid()` 注入）
- 既存 inline editor: `src/app/(admin)/admin/(dashboard)/_shared/components/rich-label-input/RichLabelInput.tsx`（リネーム対象）
- 既存共有 SC: `src/shared/components/TokenLabel.tsx`（リネーム対象）
- Section 編集 UI: `src/app/(admin)/admin/(dashboard)/pages/[slug]/_sections/_components/auto-section-form.tsx`

## ステータス

- **2026-05-09 作成（Clean Break 版）** — レビュー待ち
- **次工程**: writing-plans skill で Phase 0（既存 ButtonLabelToken の Portable Text rename）の詳細実装計画作成 → 順次 Phase 1-4
