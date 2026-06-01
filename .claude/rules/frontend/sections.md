---
description: 公開ページの Section 描画パターン（ホームページ専用 / 標準 Section / Section config / 高さ単位）
paths:
  - src/app/(public*)/**
  - src/shared/lib/sections/**
  - src/app/(admin)/**/edit/_components/**
---

# 公開ページ Section パターン

> Dynamic Section Architecture（DB 駆動）+ ホームページ専用 editorial 構造の SSoT

## ホームページ Section 管理

- **`homepage-*` セクション型はホームページ専用** — 他ページの `hero` / `cta` / `features` 等は標準セクション型（SectionRenderer 描画）。`homepage-*` に置き換えない
- **ホームページは DB 未登録でも表示される** — `page.tsx` が `homepage-*` セクションをフィルタし、0 件なら editorial コンポーネントの defaultProps で直接レンダリング
- **ホームページ Spaces セクションは SC + CC 分離** — `spaces-section.tsx`（SC: ヘッダー + CTA）が `spaces-carousel.tsx`（CC: Center Stage Carousel）を呼ぶ
  - **重なり**: 中央カード `z-30/scale-1`、隣 `z-20/scale-0.9` のカードスタック
  - **無限スクロール**: 51 回繰り返しで実装
  - **UI**: detail パネル + ドットインジケーター
  - **操作**: 矢印 / スワイプ / キーボード / ドット
  - **自動回転**: `autoPlayInterval` 秒。hover / focus / reduced-motion / tab 非表示で停止、ユーザー操作後 8 秒一時停止

## Seed と Section config

- **seed 再実行時のホームページセクション重複** — seed は既存セクションを削除せず追加する。旧型（`hero-parallax` / `concept` 等）と新型（`homepage-*`）が重複し、管理画面に二重表示される。seed 後に旧型を手動削除するか、seed スクリプトに既存セクション削除ロジックを追加する
- **seed は既存セクションの config を更新しない** — `DEFAULT_PAGE_SECTIONS` のフォーマットが変更されても（例: `imageUrl` → `images` 配列）、既存 DB レコードは旧フォーマットのまま。`mapHeroConfig` 等のマッパーが `arr(config, "images")` で取得できずデフォルト 1 枚にフォールバックする。手動で DB 更新するか seed reset が必要
- **ホームページセクション固有の UI 設定は section config に追加** — カルーセル速度・表示件数等のセクション固有設定は `definitions/homepage-*/schema.ts` に `field.*` ヘルパーで追加する。Settings シングルトンではなくセクション単位で管理画面から制御可能（AutoSectionForm が自動フォーム生成）
- **セクション定義の enum は `as const` 配列 + `field.select` + Set 型ガード** — `HERO_TRANSITIONS` のように schema ファイルに `as const` 配列を定義し、`field.select` の `options` に渡す。消費側（`page.tsx`）では `new Set<string>(VALUES)` + `is*` 型ガードでパース。`enums/helpers.ts` と同構造だがセクション定義はスキーマファイルに閉じる

## 高さ単位 / Hero

- **section 高さは `svh`、ページ chrome 全体は `dvh` を使用** — `vh` / `h-screen` / `min-h-screen` は iOS Safari でアドレスバー高さを含めないため body が overflow する [CSS Working Group `vh-bug` 公式 issue](https://github.com/w3c/csswg-drafts/issues/4329)。section 高さは `min-h-[*svh]` (small viewport、アドレスバー表示時の最小値で固定、可読性安定)、ページ chrome 全体 wrapper は `min-h-dvh` (dynamic viewport、アドレスバー表示/非表示で動的調整、folder UI 等の chrome 切替に追従)。`h-[*vh]` / `h-screen` / `min-h-screen` は全廃済 (PR #216、Safari 15.4+ / Chrome 108+ / Firefox 101+ で dvh / svh / lvh ネイティブ対応、本プロジェクト最低サポート Safari 16.4+ で完全動作)。`height` ではなく `min-height` でコンテンツ溢れを防ぐ（WCAG 1.4.4 準拠）。例外: error/loading/not-found の中央寄せ用 `min-h-[60vh]` (mobile fallback として中央寄せ優先の業界標準)、ダイアログの `max-h-[85vh]` (Radix Dialog 公式推奨値で mobile address bar 表示時にも切れにくい中位値)
- **ヒーロー高さはセマンティックプリセット + カスタム** — `sm/md/lg/full/custom` の 5 段階。custom 時は `heightCustom`（svh 数値）をインラインスタイルで適用。ユーザーに px / vh を直接入力させない（Squarespace / Payload CMS 方式）

## sectionLabel 単独 render 禁止

- **`sectionLabel` は title / description / その他コンテンツが存在する場合のみ表示**（業界標準 editorial pattern — Kinfolk / Cereal / NYT Magazine）。「ラベルのみ」は意味のない装飾になる
- **outer 判定に `config.sectionLabel ||` を含めない** — schema default（例: `event-calendar` の `sectionLabel: "Events"`）が truthy で sectionLabel-only でも outer 通過、`<ScrollReveal>` の inline style 残骸（`opacity: 1; transform: translate(0px, 0px);`）と共に label のみが残る silent bug
- **canonical pattern**: 各 section で `const hasTitle = config.title.length > 0;` 等を計算し、`const showSectionLabel = Boolean(config.sectionLabel) && (hasTitle || hasDescription || hasButtons);` で gate、または header block 全体を `{hasTitle && <div>...<SectionLabel/>...<Heading/>...</div>}` で囲む
- **PortableText[] フィールドの空判定は `.length > 0` 必須**（空配列 `[]` は JSX で truthy） — `{config.title && ...}` ではなく `{config.title.length > 0 && ...}`。Phase 0〜4 で string → PortableText 化したフィールドの旧 gate が silent break する典型箇所（→ `ssot-singletons.md` §Portable Text 禁止事項）
- **canonical 適用済み 18 file**: `EventCalendarSection` / `LocationListSection` / `ConceptSection` / `CTASection` / `EmbedSection` / `FaqListSection` / `InstagramSection` / `GallerySection` / `MapSection` / `TestimonialSection` / `ReservationFormSection` / `SpaceListSection` / `ContactFormSection` / `features/_features-{grid,numbered-editorial,numbered-steps}` / `space-showcase/_spaces-{grid,carousel}` / `{post,news,space}-list-simple-view` / `StandardHeroSection` 全 5 variant。新規 section 追加時は本パターン踏襲必須

## PortableTextSpan[] / Block[] 空配列で link/button text 不在 → link-name violation

`<Button label={[]} />` / `<MagneticButton label={[]} />` / `<Link><PortableTextSpans spans={[]} /></Link>` は **button/link text が empty** になり WCAG 4.1.2 (link-name / button-name) 違反 + Lighthouse a11y score 引き下げ。`PortableTextSpan[]` の空配列は JSX truthy gate (`label !== undefined` 等) で常時 true のため `<PortableTextSpans spans={[]} />` 経路に進んで何も render しない silent bug。**`.length > 0` で明示 gate が必須**:

```tsx
// Button primitive 内部 (button.tsx / magnetic-button.tsx)
const content =
  "label" in props && props.label !== undefined && props.label.length > 0 ? (
    <PortableTextSpans spans={props.label} />
  ) : (
    props.children
  );

// 呼び出し側で gate (CTASection / FaqListSection / *-list-simple-view 等)
{primaryButton && primaryButton.label.length > 0 && <MagneticButton ... />}
{config.showViewAllLink && config.viewAllText.length > 0 && <Link>...<PortableTextSpans spans={config.viewAllText} /></Link>}
```

§sectionLabel 単独 render 禁止 と同根の Portable Text 空配列 truthy gate 罠。viewAllText / label / primaryButton.label 等の任意 `PortableTextSpan[]` フィールドは link / button text source として参照するなら必ず `.length > 0` gate を併設。実例: 2026-05-13 homepage `<a href="/spaces">` link-name violation を Button / MagneticButton 内 gate + 5 呼び出し元 gate で根本解決（commit `e5938818`）。

## PortableText derive → component prop default 非発火

- **`spansToPlainText(spans)` / `blocksToPlainText(blocks)` で derive した空文字列を component prop に明示渡しすると、受取側の default arg は発火しない** — JSX 仕様で default arg は `undefined` 時のみ適用、`""` 明示渡しは default を skip する silent bug
- **canonical pattern**: 条件スプレッド `{...(value.length > 0 && { value })}`（`exactOptionalPropertyTypes` 互換）で空時は prop 自体を渡さず受取側 default に委ねる。または call site で `value || "fallback"` を計算
- **判定基準**: 送出側が `spansToPlainText(config.x)` / `blocksToPlainText(config.x)` で derive + 受取側が `prop = "デフォルト"` の default arg を持つ場合。空配列 `[]` 入力 → empty string → empty button / heading / aria-label の silent bug
- **実例**: 2026-05-13 `ContactFormSection.submitLabel`（`PublicInquiryFormCard` の `submitLabel = "送信する"` default が DB `section.config` に `submitButtonText` key 不在のとき発火せず、ボタン中身が空白で描画。Phase 3 で `string → PortableTextSpan[]` 化した時点で潜在化、seed 既存 config 不更新原則と組合せて顕在化）
- **検出 grep**: `grep -rnE 'submitLabel=\{[a-zA-Z]+\}|aria-label=\{spansToPlainText|title=\{spansToPlainText' src/app/\(public\)` で derive 値を default 持ち prop に直接渡している箇所を列挙

## システムページ hero の canonical は `hero` section type

「他システムページと揃える」判断時、**`hero` section type の `StandardHeroSection variant="minimal"`** が canonical（faq / contact / about 等が使用、`DEFAULT_PAGE_SECTIONS.faq` / `.contact` 参照）。

- **中央寄せ Container** + 両端 gold-line eyebrow (`SectionLabel`) + `text-page-hero` h1 + SplitText
- solid `bg-background`（旧 `bg-gradient-to-b from-surface via-background to-background` は axe-core `bgGradient` incomplete + production build で violation 昇格の silent bug のため 2026-05-14 に solid bg へ置換。WCAG AA 全 text token が definitively passable な solid bg 必須）。ヒーローと本文の区切りは罫線ではなく余白で表現（Editorial Magazine の whitespace 規律、PR #191 で従来の `border-b border-border` を撤去）

`page-hero` section type の `MinimalHero` は **別実装**（Page.pageHero、ホーム editorial 系の 1 variant）— **左寄せ** + uppercase eyebrow (gold-line なし) + plain h1。

- **判定手順**: `default-page-sections.ts` で他システムページが使う section type を実測してから migration target を決める。コンポーネント名の「minimal」類似で判断すると hero variant 誤選択の cascade（実例: 2026-05-13 login hero migration で `MinimalHero` を target にして左寄せ silent UX bug → `StandardHeroSection variant="minimal"` に再 migration）
- **静的 page から canonical hero を呼ぶ**: `getHeroConfig({...overrides})` + `DEFAULT_SECTION_STYLE` で薄い wrapper SC を作る（`login/_components/login-hero.tsx` 参照実装）。`createSpan()` factory は module-level 定数で評価（→ `react/forms-ssr.md` §PPR + `crypto.randomUUID()` / 非決定値）
