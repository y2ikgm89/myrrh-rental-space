---
description: 公開ページ component 固有パターン（ヘッダー Grid 3-col / カレンダーヘッダー / Disclosure chevron / Editorial underline reveal / Loading button anti-shift）+ Editorial デザイン Gotchas
paths:
  - src/app/(public*)/_shared/components/layouts/site-header.tsx
  - src/app/(public*)/events/_components/calendar-month-nav.tsx
  - src/app/(public*)/events/_components/month-picker.tsx
  - src/app/(public*)/_shared/components/ui/logout-button.tsx
  - src/app/(public*)/_shared/components/ui/button.tsx
---

# Component 固有パターン + Editorial Gotchas

> ヘッダー 3 列 Grid + カレンダー grid-cols-[1fr_auto_1fr] + Disclosure chevron + Editorial underline reveal + Loading button anti-layout-shift + Editorial デザイン規律。

## ヘッダーレイアウト（Apple / Kinfolk / Airbnb 方式）

3 列 Grid の対称配置（Logo 左 / Nav 中央 / Auth+CTA 右）は Apple / Kinfolk / Airbnb 等の Editorial 系業界標準構造。`grid-cols-3` で各列 `minmax(0, 1fr)` 均等、`col-start-*` で明示配置 + `justify-self-*` で内部位置を制御する。

**container 外側**:

```tsx
<div className="mx-auto grid max-w-[90rem] grid-cols-2 items-center justify-items-start gap-6 px-5 py-4 md:grid-cols-3 md:gap-10 md:px-8 md:py-5 lg:gap-16">
```

- `max-w-[90rem]` (= 1440px) で Apple 相当の幅制約、viewport 1920px 超でも中央寄せ
- モバイル: `grid-cols-2`（Brand + Trigger）、デスクトップ: `md:grid-cols-3`（Brand + Nav + Auth）
- `justify-items-start` で全 item の default alignment を start（stretch を回避）

**各要素の配置**:

| 要素           | class                                   | 効果                                           |
| -------------- | --------------------------------------- | ---------------------------------------------- |
| Brand          | なし（直接配置、inline-flex 内部）      | container default で cell 左端に shrink-to-fit |
| Nav            | `md:col-start-2 md:justify-self-center` | col2 中央（厳密 offset 0px）                   |
| Auth + CTA     | `md:col-start-3 md:justify-self-end`    | col3 右端                                      |
| Mobile Trigger | `justify-self-end md:hidden`            | mobile 時右端                                  |

**Radix NavigationMenu は公式構造 `Root > List > Item` 単体**。認証リンク・CTA を Root 内に混在させず、Root の兄弟として配置する（accessibility 契約の純粋化）。参照実装: `src/app/(public)/_shared/components/layouts/site-header.tsx`。

## カレンダーヘッダーレイアウト（Google / Outlook / Editorial 方式）

カレンダーの月ナビは `[今日] [<] [>]` 左集約が業界標準（Google Calendar / Outlook / Notion Calendar）。「今日」が最頻アクションで F パターン到達最短、prev/next は対で隣接維持する。Editorial トーンでは月タイトル（MonthPicker）を**中央配置**し、ページ見出しとして機能させる。

片側のみナビがある 3 要素構成で真に中央配置するには `grid-cols-[1fr_auto_1fr]` + 空 spacer パターンを使う:

```tsx
<div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
  <div className="flex items-center gap-2 justify-self-start">
    <TodayButton /> <PrevMonthButton /> <NextMonthButton />
  </div>
  <div className="justify-self-center">
    <MonthPicker ... />
  </div>
  <div aria-hidden="true" />
</div>
```

- `justify-between` は要素が 2 個の場合のみ真に対称。3 要素で「左群 + 中央 + 空」にするには grid が必須（flex では不可能）
- 「今日」ボタンは `<` / `>` と同じ `h-10` に揃える（`px-4` で横長化してグループ一体感）
- 左集約グループ内のボタンは同一 border treatment で揃える（`[今月] [<] [>]` 全て `h-10 border border-border hover:border-foreground/30`）
- **中央配置ボタンに trailing icon（`▾` / chevron 等）を置く場合は `absolute left-full` で flow 外に出す** — `<button>Label<span>▾</span></button>` を `grid-cols-[1fr_auto_1fr]` の auto 列に置くと、button 幾何中心は「Label + icon」全幅の中央になり、Label テキストの光学中心が兄弟の flex 中央揃え要素（タブ等）と比べて icon 幅分だけ左にずれる。`<span aria-hidden className="pointer-events-none absolute left-full top-1/2 ml-1.5 -translate-y-1/2">▾</span>` で icon を flow 外に出すと Label が auto 列の真ん中に揃う
- 参照実装: `src/app/(public)/events/_components/calendar-month-nav.tsx` / `event-calendar-view.tsx` / `event-list-view.tsx`

## Disclosure trigger chevron（Radix / shadcn 準拠）

Accordion / Select / Popover / custom picker の trigger に付く `▾` / chevron は **`aria-expanded` と rotate で state 連動させる**。`group-hover:translate-y-*` 等の装飾-only hover アニメは禁止（open 中も `▾` のまま state と矛盾し、hover で下がる動きに意味がない）。

```tsx
<button aria-expanded={open} className="group relative ...">
  {label}
  <span
    aria-hidden="true"
    className="pointer-events-none absolute left-full top-1/2 ml-1.5 -translate-y-1/2 text-muted-foreground transition-transform duration-200 group-aria-expanded:rotate-180"
  >
    ▾
  </span>
</button>
```

- trigger に `aria-expanded={open}` が既に付与されていれば CSS のみで state feedback 実現（JS 不要）
- `▾` + `rotate-180` = `▴` 相当の視覚表現（Unicode 文字切替より transform の方が滑らか）
- Radix Accordion `data-[state=open]:rotate-180` も同義だが、custom trigger では `aria-expanded` 属性セレクタを使う
- 参照実装: `src/app/(public)/events/_components/month-picker.tsx`

## Editorial underline reveal（Apple / Aesop / Kinfolk 方式）

Nav リンクの hover / focus / active 状態で `::after` 疑似要素が左→右に `scaleX(0→1)` アニメーションし、bronze accent の 1px 下線を reveal する。業界標準 Editorial pattern。

```tsx
const DESKTOP_NAV_LINK_CLASS =
  "relative whitespace-nowrap text-[0.75rem] uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground focus-visible:text-foreground focus-visible:outline-none after:pointer-events-none after:absolute after:inset-x-0 after:-bottom-1 after:h-px after:origin-right after:scale-x-0 after:bg-accent after:transition-transform after:duration-300 hover:after:origin-left hover:after:scale-x-100 focus-visible:after:origin-left focus-visible:after:scale-x-100 aria-[current=page]:text-foreground aria-[current=page]:after:origin-left aria-[current=page]:after:scale-x-100";
```

- `aria-[current=page]` で現在ページに常時表示（WAI-ARIA landmark）
- `data-[state=open]` で Radix dropdown trigger の active state と統合
- `prefers-reduced-motion` は CSS `transition-transform` のみで自動対応（GSAP 不使用）
- **LogoutButton 等 Custom button にも同スタイル適用**で一貫した視覚 feedback（参照: `logout-button.tsx` desktop-nav variant）

## Loading button anti-layout-shift（Apple / Stripe / Airbnb 方式）

pending state で text を変えると button 幅が変化してレイアウトシフト発生。業界標準:

- text は常時不変（「ログアウト」を維持、「ログアウト中...」に切替えない）
- icon を `IconLoader2` + `animate-spin` に差し替え
- `aria-busy={isPending}` で SR 通知
- `<span className="sr-only">中</span>` で visual 影響なく状態伝達

```tsx
<button
  type="button"
  disabled={isPending}
  aria-busy={isPending}
  className={VARIANT_CLASS[variant]}
>
  {isPending ? (
    <IconLoader2 className={cn(ICON_CLASS, "animate-spin")} aria-hidden />
  ) : (
    <IconLogout className={ICON_CLASS} aria-hidden />
  )}
  <span>ログアウト</span>
  {isPending && <span className="sr-only">中</span>}
</button>
```

参照実装: `src/app/(public)/_shared/components/ui/logout-button.tsx`。

## Editorial デザイン Gotchas

- **editorial ボタンは全箇所 `Button variant="editorial"` で統一** — raw `<Link>` + インラインスタイルで editorial ボタンを実装しない。`button.tsx` の editorial variant（シャープエッジ + bronze hover）が Single Source of Truth。site-header / cta-section / site-cta すべてで Button コンポーネントを使用
- **公開ページで `bg-foreground`（ダーク反転セクション）禁止** — Editorial Magazine（Kinfolk/Cereal）は全コンテンツセクション白背景が基本。ダーク全幅セクションは Accent 10% 制約を超え、トーンが崩れる。SiteCTA は `bg-background` + `border-t border-border`（余白で分離）
- **`editorial-border-accent` CSS クラスは Divider 専用** — `width: 4rem` を持つ短い装飾線。`Section border="accent"` 等の全幅要素に使うとレイアウトが 4rem 幅に潰れる。Section の accent border は `border-t-2 border-accent`（Tailwind ユーティリティ）を使用
- **Button editorial に色反転 override を書かない** — ダーク背景用の `className="border-background text-background hover:bg-background hover:text-accent"` は Button の variant 設計を迂回するハック。背景を `bg-background`（白）にし、editorial variant をそのまま使う
- **`section-design.ts` の値配列変更時は DesignFields + 型ガードも同期必須** — `DesignFields.tsx` の `backgroundOptions` / `paddingOptions` / `maxWidthOptions` + Set-based 型ガード（`isBgValue` 等）が `sectionBgValues` / `sectionSpacingValues` / `sectionMaxWidthValues` と 1:1 対応
