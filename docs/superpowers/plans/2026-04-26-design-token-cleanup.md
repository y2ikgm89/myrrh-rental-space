# P2: Design Token Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 公開ページの arbitrary spacing/height 値と viewport-breakpoint カードグリッドを `@theme` トークン + Container Queries に統一する。CLAUDE.md ハードルール「カードグリッドは Container Queries」「arbitrary 値 3 回以上で @theme 昇格」「`--space-*` を `SectionWrapper` 経由で参照」の遵守。後方互換なしの clean-break。

**Architecture:** ① `--hero-min-height-sm: 40svh` を public.css `@theme` に追加（既存 `--hero-min-height` (60svh) / `-lg` (80svh) / `-xl` (85svh) と並列）② `HERO_PARALLAX_HEIGHT_MAP` の arbitrary `[40svh]` / `[60svh]` / `[80svh]` を CSS 変数参照に変換 ③ `GRID_COLS_MAP` を `CARD_GRID_COLS_MAP` と同じく Container Queries variants (`@md:` / `@3xl:`) に変換 ④ 該当 consumer (`InstagramSection` / `NewsListSection`) の grid wrapper の親に `@container` を付与 ⑤ `site-footer.tsx` の `py-14 md:py-20` と `CustomSection.tsx` の `PADDING_MAP` を `--space-*` fluid token 参照に変換。

**Tech Stack:** Tailwind CSS 4.2 (CSS-first `@theme`) / Container Queries (`@container` + `@md:` / `@3xl:` variants) / 公開 `public.css` 既存トークン。新規 npm 依存なし。

**Compliance:**

- CLAUDE.md ハードルール「カードグリッドは Container Queries、マクロレイアウトは viewport breakpoint」
- CLAUDE.md ハードルール「arbitrary sizing は @theme token で参照、3 回以上使用されたら @theme に昇格」
- `frontend/project-design-config.md` §レスポンシブ設計 §採用方針
- `tailwind-patterns.md` §Container Queries — 基本パターン

**Out of scope（後続 plan）:** Empty/Error/Redirect の next-step CTA（P3）、マイページ Tabs 分離（P4）、admin Cmd+K（P5）。

---

## File Structure

| ファイル                                                      | 役割                                                                                  | 変更種別 |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------- | -------- |
| `src/app/(public)/_styles/public.css`                         | `--hero-min-height-sm: 40svh` を `@theme` に追加                                      | 修正     |
| `src/app/(public)/_shared/lib/section-style-maps.ts`          | `GRID_COLS_MAP` → @container variants 化、`HERO_PARALLAX_HEIGHT_MAP` → CSS 変数参照化 | 修正     |
| `src/app/(public)/_components/InstagramSection.tsx`           | grid wrapper の親に `@container` 追加                                                 | 修正     |
| `src/app/(public)/_components/NewsListSection.tsx`            | 同上                                                                                  | 修正     |
| `src/app/(public)/_shared/components/layouts/site-footer.tsx` | `py-14 md:py-20` → `--space-md md:--space-xl` (CSS 変数)                              | 修正     |
| `src/app/(public)/_components/CustomSection.tsx`              | `PADDING_MAP` を `--space-*` 参照に変換                                               | 修正     |

---

## Pre-flight Verification

- [ ] **Step 0.1: ベースライン validate**

```bash
bun run validate > /tmp/validate-pre-p2.log 2>&1; echo "EXIT=$?"
```

Expected: `EXIT=0`。

- [ ] **Step 0.2: 既存 token 確認**

```bash
grep -n "hero-min-height\|space-sm\|space-md\|space-lg\|space-xl" 'src/app/(public)/_styles/public.css' | head -20
```

Expected:

- `--hero-min-height: 60svh` / `-lg: 80svh` / `-xl: 85svh` 存在
- `--space-sm` / `-md` / `-lg` / `-xl` / `-2xl` 存在
- `--hero-min-height-sm` **不在**（Task 1 で追加）

---

## Task 1: `--hero-min-height-sm: 40svh` を public.css @theme に追加

**Files:**

- Modify: `src/app/(public)/_styles/public.css`

- [ ] **Step 1.1: `--hero-min-height-sm` を既存 token の直前に追加**

`grep -n "hero-min-height" public.css` で行番号を特定し、`--hero-min-height: 60svh;` の直前に追加:

```css
--hero-min-height-sm: 40svh;
--hero-min-height: 60svh;
--hero-min-height-lg: 80svh;
--hero-min-height-xl: 85svh;
```

**変更点:** `HERO_PARALLAX_HEIGHT_MAP.sm` の arbitrary `[40svh]` を `var(--hero-min-height-sm)` で参照可能にする。

- [ ] **Step 1.2: 検証 + commit**

```bash
bun run type-check > /tmp/tc-task1.log 2>&1; echo "TC=$?"
git add 'src/app/(public)/_styles/public.css'
git commit -m "$(cat <<'EOF'
feat(public/theme): add --hero-min-height-sm token (40svh)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: HERO_PARALLAX_HEIGHT_MAP を CSS 変数参照化

**Files:**

- Modify: `src/app/(public)/_shared/lib/section-style-maps.ts`

- [ ] **Step 2.1: HERO_PARALLAX_HEIGHT_MAP を CSS var 参照に書き換え**

```typescript
// Before
export const HERO_PARALLAX_HEIGHT_MAP: Record<string, string> = {
  sm: "min-h-[40svh]",
  md: "min-h-[60svh]",
  lg: "min-h-[80svh]",
  full: "min-h-svh",
};

// After
export const HERO_PARALLAX_HEIGHT_MAP: Record<string, string> = {
  sm: "min-h-[var(--hero-min-height-sm)]",
  md: "min-h-[var(--hero-min-height)]",
  lg: "min-h-[var(--hero-min-height-lg)]",
  full: "min-h-svh",
};
```

`full` は CSS native value (`100svh`) でちょうど良いため token 化不要。

- [ ] **Step 2.2: 検証 + commit**

```bash
bun run type-check > /tmp/tc-task2.log 2>&1; echo "TC=$?"
bun run lint 'src/app/(public)/_shared/lib/section-style-maps.ts' > /tmp/lint-task2.log 2>&1; echo "LINT=$?"
git add 'src/app/(public)/_shared/lib/section-style-maps.ts'
git commit -m "$(cat <<'EOF'
refactor(public/sections): HERO_PARALLAX_HEIGHT_MAP references @theme tokens

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: GRID_COLS_MAP を @container variants に変換

**Files:**

- Modify: `src/app/(public)/_shared/lib/section-style-maps.ts`

- [ ] **Step 3.1: GRID_COLS_MAP と DEFAULT_GRID_COLS を @container 化**

CARD_GRID_COLS_MAP と同じパターンに統一する:

```typescript
// Before
export const GRID_COLS_MAP: Record<number, string> = {
  1: "",
  2: "md:grid-cols-2",
  3: "md:grid-cols-2 lg:grid-cols-3",
  4: "md:grid-cols-2 lg:grid-cols-4",
  5: "md:grid-cols-3 lg:grid-cols-5",
  6: "md:grid-cols-3 lg:grid-cols-6",
};

export const DEFAULT_GRID_COLS = "md:grid-cols-3";

// After (Container Queries variants — consumer の親に @container 必須)
export const GRID_COLS_MAP: Record<number, string> = {
  1: "grid-cols-1",
  2: "grid-cols-1 @md:grid-cols-2",
  3: "grid-cols-1 @md:grid-cols-2 @3xl:grid-cols-3",
  4: "grid-cols-1 @md:grid-cols-2 @3xl:grid-cols-4",
  5: "grid-cols-2 @md:grid-cols-3 @3xl:grid-cols-5",
  6: "grid-cols-2 @md:grid-cols-3 @3xl:grid-cols-6",
};

export const DEFAULT_GRID_COLS = "grid-cols-1 @md:grid-cols-2 @3xl:grid-cols-3";
```

**変更点:**

- `1` キー: `""` (no-op) → `"grid-cols-1"` で一貫性確保
- viewport `md:` / `lg:` → container `@md:` / `@3xl:` （tailwind v4 公式 container queries variants）
- 5/6 列はモバイル時 `grid-cols-2` で詰めて表示（Instagram ピクセルリスト等の小要素向け）

- [ ] **Step 3.2: 検証**

```bash
bun run type-check > /tmp/tc-task3.log 2>&1; echo "TC=$?"
```

EXIT=0 を確認。実際の grid 適用は次の Task 4 で consumer 側に `@container` を付与してから動作する。

- [ ] **Step 3.3: commit**

```bash
git add 'src/app/(public)/_shared/lib/section-style-maps.ts'
git commit -m "$(cat <<'EOF'
refactor(public/sections): GRID_COLS_MAP adopts container queries variants

CARD_GRID_COLS_MAP と同じく @md/@3xl variants で統一。consumer は次 commit で
親要素に @container を付与（CLAUDE.md ハードルール: カードグリッドは Container
Queries、マクロレイアウトは viewport breakpoint）。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: GRID_COLS_MAP consumers の grid 親に @container 付与

**Files:**

- Modify: `src/app/(public)/_components/InstagramSection.tsx`
- Modify: `src/app/(public)/_components/NewsListSection.tsx`

- [ ] **Step 4.1: InstagramSection.tsx**

`getGridColsClass(config.columns)` を呼ぶ `<div>` (line 69-74 周辺) は、コンテナ幅で grid を決めたいので親 `<ScrollReveal>` の **直近の wrapper** に `@container` を付与する必要がある。`ScrollReveal` は内部で `<div>` をレンダリングしないため、`<ScrollReveal>` 内側の `<div>` 自体に `@container` を追加する:

```tsx
// Before (line 68-75 周辺)
<ScrollReveal>
  <div
    className={cn(
      "grid grid-cols-2",
      getGridColsClass(config.columns),
      GAP_MAP[parseGapSize(config.gap)],
    )}
  >

// After: @container を grid 自身に付与
<ScrollReveal>
  <div
    className={cn(
      "@container grid",
      getGridColsClass(config.columns),
      GAP_MAP[parseGapSize(config.gap)],
    )}
  >
```

**変更点:**

- `grid-cols-2` を base から削除（`getGridColsClass` の `1` キーが `grid-cols-1` を返すため）
- `@container` を grid 自身に付与（自分自身の幅で variants が判定される）
- `grid` 単独で base 設定

- [ ] **Step 4.2: NewsListSection.tsx**

同じパターン:

```tsx
// Before (line 119-121 周辺)
<div
  className={
    isCardLayout
      ? cn("grid gap-6", getGridColsClass(config.columns))
      : "..."
  }
>

// After: cardLayout ブランチに @container 追加
<div
  className={
    isCardLayout
      ? cn("@container grid gap-6", getGridColsClass(config.columns))
      : "..."
  }
>
```

isCardLayout 以外のブランチには影響しない。

- [ ] **Step 4.3: 検証**

```bash
bun run type-check > /tmp/tc-task4.log 2>&1; echo "TC=$?"
bun run lint 'src/app/(public)/_components/InstagramSection.tsx' \
             'src/app/(public)/_components/NewsListSection.tsx' > /tmp/lint-task4.log 2>&1; echo "LINT=$?"
```

EXIT=0 を確認。

- [ ] **Step 4.4: 視覚目視（dev server）**

```
manual checklist:
1. /  ホームページの InstagramSection が container width に応じて grid 切替（mobile 2 cols / md+ N cols）
2. /  ホームページの NewsListSection (cardLayout) が container width で 1 → 2 → 3 cols 切替
```

- [ ] **Step 4.5: commit**

```bash
git add 'src/app/(public)/_components/InstagramSection.tsx' \
        'src/app/(public)/_components/NewsListSection.tsx'
git commit -m "$(cat <<'EOF'
refactor(public/sections): InstagramSection + NewsListSection adopt @container

GRID_COLS_MAP の container queries variants を有効化するため grid 親に
@container を付与。viewport breakpoint からコンテナ幅ベースに移行し、
親レイアウトの幅変化に追従するようになる。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: site-footer.tsx の py 値を CSS 変数化

**Files:**

- Modify: `src/app/(public)/_shared/components/layouts/site-footer.tsx`

- [ ] **Step 5.1: py-14 md:py-20 を CSS 変数参照に**

```tsx
// Before (line 169 周辺)
<div className="mx-auto max-w-6xl px-5 py-14 md:px-8 md:py-20">

// After
<div className="mx-auto max-w-6xl px-5 py-[var(--space-md)] md:px-8 md:py-[var(--space-xl)]">
```

**根拠:**

- `py-14` (56px) → `--space-md` (clamp 48-112px、mobile 48px、md+ ~74px、xl+ 112px) で適切な fluid scaling
- `md:py-20` (80px) → `--space-xl` (clamp 80-240px) で desktop は 80px 維持しつつ ultra-wide でゆとり

- [ ] **Step 5.2: 検証 + commit**

```bash
bun run type-check > /tmp/tc-task5.log 2>&1; echo "TC=$?"
bun run lint 'src/app/(public)/_shared/components/layouts/site-footer.tsx' > /tmp/lint-task5.log 2>&1; echo "LINT=$?"
git add 'src/app/(public)/_shared/components/layouts/site-footer.tsx'
git commit -m "$(cat <<'EOF'
refactor(public/footer): adopt --space-* fluid tokens for vertical padding

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: CustomSection.tsx の PADDING_MAP を CSS 変数化

**Files:**

- Modify: `src/app/(public)/_components/CustomSection.tsx`

- [ ] **Step 6.1: PADDING_MAP を `--space-*` 参照に書き換え**

```tsx
// Before
const PADDING_MAP = {
  none: "",
  sm: "py-8 md:py-12",
  md: "py-16 md:py-24",
  lg: "py-24 md:py-32",
} as const;

// After
const PADDING_MAP = {
  none: "",
  sm: "py-[var(--space-sm)]",
  md: "py-[var(--space-md)] md:py-[var(--space-lg)]",
  lg: "py-[var(--space-lg)] md:py-[var(--space-xl)]",
} as const;
```

**根拠:**

- `sm`: py-8 (32px) → md:py-12 (48px) → `--space-sm` (clamp 32-64px) で 1 token に集約（fluid）
- `md`: py-16 (64px) → md:py-24 (96px) → `--space-md → --space-lg` (3-7rem → 4-11rem) で mobile 48px / md+ 64px+ 維持
- `lg`: py-24 (96px) → md:py-32 (128px) → `--space-lg → --space-xl` (4-11rem → 5-15rem) で mobile 64px / md+ 80px+ 維持

CustomSection は `[...segments]` カスタムページの中核なので `SectionWrapper`-driven の他セクションと垂直リズムが一致するようになる。

- [ ] **Step 6.2: 検証 + commit**

```bash
bun run type-check > /tmp/tc-task6.log 2>&1; echo "TC=$?"
bun run lint 'src/app/(public)/_components/CustomSection.tsx' > /tmp/lint-task6.log 2>&1; echo "LINT=$?"
git add 'src/app/(public)/_components/CustomSection.tsx'
git commit -m "$(cat <<'EOF'
refactor(public/sections): CustomSection PADDING_MAP adopts --space-* tokens

カスタムページのセクションが SectionWrapper-driven 標準セクションと
垂直リズムが揃う。CLAUDE.md ハードルール「arbitrary sizing は @theme
token で参照」準拠。

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: 最終検証

- [ ] **Step 7.1: フル validate + build**

```bash
bun run validate > /tmp/validate-final-p2.log 2>&1; echo "VALIDATE=$?"
bun run build > /tmp/build-final-p2.log 2>&1; echo "BUILD=$?"
```

両方 EXIT=0 必須。

- [ ] **Step 7.2: 違反パターン残存ゼロ grep**

```bash
# Plan 対象の arbitrary 値が残っていないか
grep -nE 'min-h-\[(40|60|80)svh\]' 'src/app/(public)/' -r --include="*.ts" --include="*.tsx" \
  | grep -v "hero-min-height" \
  || echo "OK: no remaining hero arbitrary heights"

# GRID_COLS_MAP に viewport breakpoint が残っていないか
grep -nE '(md:|lg:)grid-cols' 'src/app/(public)/_shared/lib/section-style-maps.ts' \
  || echo "OK: GRID_COLS_MAP fully container-queried"

# site-footer / CustomSection に hardcoded py-14/16/20/24/32 が残っていないか
grep -nE 'py-(14|16|20|24|32)\b' 'src/app/(public)/_shared/components/layouts/site-footer.tsx' \
                                  'src/app/(public)/_components/CustomSection.tsx' \
  || echo "OK: footer + CustomSection use --space-* tokens"
```

すべて「OK: ...」が出ること。

- [ ] **Step 7.3: commit log 確認**

```bash
git log --oneline -10
```

P2 の 6 commit が連続して並ぶことを確認。

---

## Self-Review Checklist

- [ ] **Spec coverage**: GRID_COLS_MAP 移行 / CSS 変数追加 / HERO_PARALLAX_HEIGHT_MAP / footer / CustomSection の 5 領域すべてカバー
- [ ] **Placeholder 検証**: 全 task に実コード + 実 commit メッセージ
- [ ] **Type consistency**: GRID_COLS_MAP 戻り値型 `string`、consumer の `cn()` 引数型と一致。`HERO_PARALLAX_HEIGHT_MAP` も `string` 値のまま
- [ ] **後方互換**: GRID_COLS_MAP の戻り値が `""` (no-op) → `"grid-cols-1"` に変わるのみ。Tailwind 上で機能等価
- [ ] **CLAUDE.md ハードルール準拠**: hardcoded カラー / `as` キャスト / `useCallback` 不使用 / `cn()` 使用 / SSoT 維持

---

## Execution Notes

**推奨実行モード**: 全 6 task が小規模・パターン明確のため controller 直接実行（implementer dispatch のオーバーヘッド過大）。

**並列化候補**: 全 task が独立しており、Task 5 (footer) / Task 6 (CustomSection) は完全に並列可能。Task 3 (GRID_COLS_MAP 修正) → Task 4 (consumer @container 追加) は **順序依存**（map のキー `1` が `grid-cols-1` に変わったタイミングで base `grid-cols-2` 削除が必要）。Task 1 → Task 2 も順序依存（先に CSS token 追加）。
