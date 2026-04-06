# Background Color Unification Design

> 公開ページの背景色を Kinfolk/Cereal 準拠に統一する破壊的リファクタリング

## Problem

現在の公開ページは `bg-background`（白）と `bg-surface`（薄茶）の交互配置をセクション間で行っているが、以下の問題がある:

1. **交互配置が壊れている** — ホームページで Features のみ `bg-surface`、他は暗黙の白
2. **フッターとセクションが同色** — `bg-surface` がフッター背景とセクション背景の両方に使われ、境界が溶ける
3. **Kinfolk/Cereal の実際のパターンと乖離** — 参考サイトはセクション交互配置を使わず、余白とタイポグラフィで分離
4. **未使用トークンの残骸** — `surface-light`, `surface-alt` が定義されているが実質未使用

## Design

### Principle

> 背景色は全コンテンツセクションで統一白。フッターのみ薄茶。分離は余白・ボーダー・タイポグラフィで行う。

Kinfolk/Cereal の手法に忠実に従い、色差ではなく**空間とタイポグラフィ**でセクション間のリズムを作る。

### Color Token Changes

| Token                   | Before                  | After    | Change                       |
| ----------------------- | ----------------------- | -------- | ---------------------------- |
| `--color-background`    | `oklch(0.985 0.005 60)` | 変更なし | —                            |
| `--color-surface`       | `oklch(0.94 0.012 60)`  | 変更なし | 用途をフッターに限定         |
| `--color-card`          | `oklch(0.96 0.008 60)`  | 変更なし | カード・画像プレースホルダ用 |
| `--color-surface-light` | `oklch(0.97 0.008 60)`  | **削除** | 未使用                       |
| `--color-surface-alt`   | `oklch(0.975 0.006 60)` | **削除** | 未使用                       |

### Page Vertical Stack (All Pages)

```
Header      bg-background (sticky, scroll shadow)
────────────────────────────────────────────────
Hero        bg-background (visual variety via images/typography)
Section     bg-background (separated by --spacing-section)
Section     bg-background
...
CTA         bg-background + border-t border-border
────────────────────────────────────────────────
Footer      bg-surface + border-t border-border
```

### Section Separation (Replacing Alternating Backgrounds)

| Method                               | Usage                                          |
| ------------------------------------ | ---------------------------------------------- |
| Vertical spacing `--spacing-section` | Standard (all section gaps)                    |
| `Divider variant="subtle"`           | Optional, between distinct topics              |
| `border-t border-border`             | CTA and footer boundaries                      |
| Typography hierarchy                 | SectionLabel → Heading → body rhythm           |
| Images and bronze accent             | Visual variety through content, not background |

## Affected Files

### CSS Tokens

- **`public.css`**: Delete `--color-surface-light`, `--color-surface-alt`

### Design System Primitives

- **`section.tsx`**: Remove `surface-alt` variant from `SectionBackground` type and `bgClasses`

### SectionWrapper (DB-driven, preserved)

- **No structural changes**. Admin-selected `surface` / `dark` / `image` respected
- Remove `gradient` variant (`from-surface to-background` — relies on surface being a content-area color)

### Homepage Components

| File                       | Change                                       |
| -------------------------- | -------------------------------------------- |
| `how-it-works-section.tsx` | Remove `bg-surface` → implicit white         |
| `features-section.tsx`     | Remove `bg-surface` → implicit white         |
| `hero-section.tsx`         | `bg-surface` (image placeholder) → `bg-card` |
| `spaces-carousel.tsx`      | `bg-surface` (placeholder) → `bg-card`       |

### SiteCTA

- Already updated: `background="default"` + `border="top"` as defaults

### Page-level Changes

| File                             | Change                                                  |
| -------------------------------- | ------------------------------------------------------- |
| `events/page.tsx`                | `Section background="surface"` → `background="default"` |
| `_components/ConceptSection.tsx` | `bg-surface` decorative div → `bg-card`                 |

### Legacy Section Components (`_components/*.tsx`)

- `CTASection.tsx` centered variant — already fixed
- Audit remaining `bg-surface` usage in legacy section components

### Documentation

| File                       | Change                                                                                  |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `project-design-config.md` | Remove alternating background references; update section separation to spacing + border |
| `gotchas.md`               | Remove "ホームページセクションは背景色を交互配置" entry                                 |

## Not Changed

| Item                                      | Reason                                                               |
| ----------------------------------------- | -------------------------------------------------------------------- |
| Footer `bg-surface`                       | Only color change on page; visual anchor for "site info starts here" |
| SectionWrapper `surface`/`dark`/`image`   | Admin explicit choice respected                                      |
| `--color-card`                            | Valid use for form frames, card interiors                            |
| Admin CSS (`admin.css`)                   | Out of scope                                                         |
| Gallery/Carousel `bg-surface/80` overlays | UI control visibility, not section background                        |

## Verification

- `bun run validate` passes
- `bun run build` passes
- No remaining `bg-surface` in page-level components (only footer + SectionWrapper DB choices + card overlays)
- `surface-light` and `surface-alt` have zero references
