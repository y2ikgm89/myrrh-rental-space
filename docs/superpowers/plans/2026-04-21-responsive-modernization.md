# Responsive Modernization — Tailwind 4 / Next.js 16 / WCAG 2.2 公式準拠

> 破壊的変更 OK / 後方互換性なし / クリーン実装 / context7 検証済み

## 目的

Tailwind 4 の CSS-first `@theme`、Next.js 16 viewport API、WCAG 2.2 AAA の touch target 要件、Container Queries の公式ベストプラクティスに完全準拠した、すべてクリーンなレスポンシブ実装に刷新する。

## 背景（現状分析 — ground truth 検証済み）

- `sm:` 294 / `md:` 372 / `lg:` 138 / `xl:` **18** / `2xl:` **0** — xl/2xl 体系不足
- `@container` 採用 **9 ファイル**（MainContent / PostListSection / SpaceListSection / SpaceShowcaseSection / section-style-maps / space-grid / post-grid / TestimonialSection / related-spaces）— gotchas.md の記述（8〜9 ファイル）と整合済み（2026-04-22 検証）
- admin.css に fluid spacing / typography / container tokens **ゼロ**
- public.css の `--header-height: 64px` **固定**（mobile/desktop 分岐なし）
- admin layout `viewport` に **themeColor / interactiveWidget 欠落**
- Button `size="sm"` = `min-h-10` (40px) — WCAG 2.5.5 Enhanced (44px) 未達
- public `_shared/` 内 **arbitrary sizing 86 箇所 / 69 ファイル**（一部は意図的 editorial `max-w-[65ch]`）

## 設計原則（公式推奨の適用方針）

### Tailwind v4（context7 確認済み）

- **default breakpoint 名（sm/md/lg/xl/2xl）を維持**し `--breakpoint-3xl: 120rem` を**追加**（完全リセット `--breakpoint-*: initial` は shadcn/ui / Radix エコシステム互換性を損なうため不採用）
- Container Queries `@container` + 必要箇所では named container `@container/main` / `@container/sidebar`
- `@max-*` variant は iPad landscape など edge case のみ
- `@theme` で fluid `clamp()` typography / spacing を SSoT 化

### Next.js 16 viewport（context7 確認済み）

- `themeColor: [{media: '(prefers-color-scheme: light)', ...}, {media: ..., ...}]` array 形式
- `interactiveWidget: "resizes-visual"` で仮想キーボード対応
- `colorScheme` 明示

### WCAG 2.2（context7 確認済み）

- **2.5.5 Target Size (Enhanced, AAA) = 44×44 CSS px** を全インタラクティブ要素に
- **1.4.10 Reflow** = `max-width: 100%` + `height: auto` 徹底
- Pagination / inline link は `min-block-size: 44px` + `min-inline-size: 44px`

## フェーズ構成

### Phase A: @theme トークン完全化

**public.css**:

- `--breakpoint-3xl: 120rem` 追加（ultra wide 1920px+）
- `--header-height` を `3.5rem` (mobile) → `4rem` (≥48rem) の media query 切替
- site-header の `max-w-[90rem]` を `--container-header-max: 90rem` として @theme 化
- `--modal-max-height: 85vh`、`--hero-min-height: 60svh` を追加

**admin.css**（大規模追加）:

```css
@theme {
  /* Layout */
  --container-max: 100rem; /* admin は広め */
  --container-padding: clamp(1rem, 2vw, 2rem);
  --sidebar-width: 18rem;
  --header-height: 3.5rem;

  /* Spacing — fluid */
  --spacing-section: clamp(2rem, 4vw, 3rem);
  --spacing-block: clamp(1.5rem, 3vw, 2.5rem);
  --spacing-card: clamp(1rem, 2vw, 1.5rem);

  /* Typography — fluid */
  --text-h1: clamp(1.5rem, 1.25rem + 1.25vw, 2rem);
  --text-h1--line-height: 1.2;
  --text-h1--font-weight: 600;
  --text-h2: clamp(1.25rem, 1.125rem + 0.625vw, 1.5rem);
  --text-h2--line-height: 1.3;
  --text-h2--font-weight: 600;
  --text-h3: clamp(1.125rem, 1.0625rem + 0.3125vw, 1.25rem);

  /* Breakpoint — 3xl 追加 */
  --breakpoint-3xl: 120rem;
}
```

### Phase B: Next.js 16 viewport API 完全準拠

**`src/app/(admin)/layout.tsx`**:

```typescript
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  interactiveWidget: "resizes-visual",
  colorScheme: "light",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#2563eb" },
    { media: "(prefers-color-scheme: dark)", color: "#1e40af" },
  ],
};
```

**`src/app/(public)/layout.tsx`** の `generateViewport` を light/dark array 対応 + interactiveWidget 追加。

### Phase C: WCAG 2.5.5 Enhanced (AAA) 44px 化

- public Button `size="sm"`: `min-h-10` → `min-h-11`
- admin Button 全 size: 最小 `min-h-11`
- checkbox / radio: wrapper に `flex items-center min-h-11` でヒットエリア確保
- pagination / inline link: `min-block-size / min-inline-size: 44px`（CSS-only、`editorial-link-tap` utility 新設）

### Phase D: Container Queries 全面採用

**public**:

- `space-grid.tsx`: `grid-cols-1 sm:grid-cols-2` → `@container` + `@md:grid-cols-2 @3xl:grid-cols-3`
- `features-section.tsx`: 構造上不要（grid 切替なし） → docs 修正のみ
- `news-list` / `event-list` など remaining 一覧を @container 化

**admin**:

- `(dashboard)/layout.tsx` の main に `@container/main`
- `ResponsiveSidebar` に `@container/sidebar`（折りたたみ時の main content 適応）
- ダッシュボードカード / 詳細ページ 2 カラムを named container query に

### Phase E: arbitrary values → @theme 集約

**集約対象**（3 回以上使用される値のみ昇格）:

- `max-w-[65ch]` (Prose / Container editorial) → `--container-measure: 65ch`
- `max-w-[40ch]` / `max-w-[45ch]` → `--prose-narrow: 40ch` / `--prose-medium: 45ch`
- `min-h-[60svh]` → `--hero-min-height: 60svh`
- `max-h-[85vh]` / `max-h-[90svh]` → `--modal-max-height`, `--lightbox-max-height`
- `min-w-[12rem]` (dropdown) → `--dropdown-min-width: 12rem`
- `max-w-[90rem]` (site-header) → `--container-header-max: 90rem`

**残置（意図的 arbitrary）**: typography `[0.7rem]`、単発の微調整値（1 箇所しか使われないもの）。

### Phase F: rules/gotchas.md drift 修正

- @container 採用範囲を実装と一致させる記述に更新
- `.claude/rules/frontend/project-design-config.md` に **breakpoint policy**（sm/md/lg/xl/2xl/3xl の semantic 使い分け）を追加
- WCAG 2.5.5 Enhanced 採用を accessibility.md に明記
- admin.css の fluid typography / spacing を anti-ai-design.md / project-design-config.md に反映

### 最終検証

1. `bun run validate`（type-check + lint）
2. `bun run build`
3. dev サーバー再起動（Tailwind 4 HMR が新 `--breakpoint-3xl` と新 variant を scan する必要あり）
4. 主要ページ疎通: `/` `/spaces` `/posts` `/events` `/admin` `/admin/spaces`

## 破壊的変更リスト

1. `--header-height` が mobile/desktop で値変化 → 既存 `calc(var(--header-height)+2rem)` 等は自動追従、ピクセル単位ハードコードがあれば検出
2. Button `size="sm"` の高さ変化（40px → 44px）→ 隣接レイアウトの微調整が必要になる可能性
3. admin.css に `--text-h1` 等が新規定義 → 既存の admin `text-2xl font-bold` 等と並立（置き換えは後続スプリント）
4. `@container` 化により SpaceGrid 内部 layout が container 幅依存に変化（viewport-independent）
5. admin sidebar の named container 採用により、サイドバー折りたたみ状態で main content が追従（今までは viewport 固定）

## ロールバック戦略

各 Phase を **1 commit で完結**させる。問題があれば `git revert <commit>` で Phase 単位に戻せる。commit メッセージは `refactor(responsive): phase-A @theme tokens`、`phase-B viewport API`、…と phase 名 prefix。

## 参考文献（context7 で取得）

- [Tailwind v4 responsive design](https://tailwindcss.com/docs/responsive-design) — @container、@max-\*、named containers、`--breakpoint-*: initial`
- [Next.js 16 generateViewport](https://nextjs.org/docs/app/api-reference/functions/generate-viewport) — interactiveWidget、themeColor array、colorScheme
- [WCAG 2.2 SC 2.5.5 Target Size (Enhanced)](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced) — 44×44 CSS px AAA
- [WCAG 2.2 Technique C44 / C42](https://www.w3.org/WAI/WCAG22/Techniques/css/C44) — min-block-size / min-inline-size パターン
