# Design System Decisions

> Public pages design system SSoT. Editorial Magazine × Japanese typography.
> Updated: 2026-04-17 — typography scale refactor (editorial-appropriate sizing).

## Brand Direction

- **Mood**: Editorial Magazine (Kinfolk / Cereal / The Gentlewoman 系統)
- **Personality**: 上品、抑制された余白、控えめなインタラクション
- **Reference URLs**:
  - https://www.kinfolk.com/ — Cormorant Garamond light、article titles ~40px
  - https://thegentlewoman.co.uk/ — セリフ light、余白多め
  - https://readcereal.com/ — 抑制された階層、~32–40px タイトル
  - https://monocle.com/ — 密度高め、タイト line-height

## Typography

### Fonts (public.css)

- `--font-sans: "Noto Sans JP", sans-serif;` — 日本語全般 / 本文 / UI
- `--font-serif: "Cormorant Garamond", "Noto Sans JP", serif;` — Hero / h1 / h2

### Scale (`src/app/(public)/_styles/public.css`)

モジュラー比 ~1.25（Major Third）。Hero はインパクト用外れ値。
Fluid clamp は 375px → 1280px viewport にアンカー。

| Token              | clamp                                       | 推定 px   | 用途                          |
| ------------------ | ------------------------------------------- | --------- | ----------------------------- |
| `--text-hero`      | `clamp(3rem, 2rem + 4.5vw, 5rem)`           | 48 → 80   | Hero セクション専用           |
| `--text-h1`        | `clamp(1.875rem, 1.5rem + 1.75vw, 2.5rem)`  | 30 → 40   | ページメインタイトル          |
| `--text-h2`        | `clamp(1.5rem, 1.25rem + 1.15vw, 2rem)`     | 24 → 32   | セクション見出し              |
| `--text-h3`        | `clamp(1.25rem, 1.15rem + 0.5vw, 1.5rem)`   | 20 → 24   | サブセクション / カード       |
| `--text-h4`        | `1.125rem`                                  | 18 固定   | ラベル的見出し                |
| `--text-pullquote` | `clamp(1.5rem, 1.25rem + 1.15vw, 2rem)`     | 24 → 32   | 記事中の強調引用              |
| `--text-body`      | `1rem`                                      | 16        | 本文                          |
| `--text-small`     | `0.875rem`                                  | 14        | メタ情報                      |
| `--text-eyebrow`   | `0.6875rem` + `tracking-[0.18em]`           | 11 固定   | セクションラベル uppercase    |
| `--text-label`     | `0.6875rem`                                 | 11 固定   | フォームラベル                |

### Typography Rules

- Font-weight / letter-spacing / line-height は `@theme --text-*--{font-weight,letter-spacing,line-height}` で集中管理
- 呼び出し側で `font-light` / `leading-*` / `tracking-*` を重ねない（editorial-card featured の意図的 override を除く）
- `.font-heading` は `font-family: var(--font-serif)` のみ（letter-spacing は持たせない）
- `h1`–`h6` に `text-wrap: balance` + `word-break: auto-phrase` を `@layer base` で自動適用（日本語フレーズ折返し対応、Chrome 119+）

## Color Allocation (Luxury White × Bronze)

70 / 20 / 10 配分。OKLCH 形式。

| Role     | % max  | Value                                  | Usage                              |
| -------- | ------ | -------------------------------------- | ---------------------------------- |
| Dominant | 70     | `oklch(0.985 0.005 60)` Warm White     | ページ背景                         |
| Support  | 20     | `oklch(0.96 0.008 60)` Light Surface   | カード / セクション背景            |
| Accent   | 10–15  | `oklch(0.62 0.07 60)` Soft Bronze      | ラベル / CTA / 価格                |

## Spatial Design

- Section padding: `py-[var(--spacing-section)]` = `clamp(7rem, 12vw, 11rem)`
- Homepage padding: `py-[var(--spacing-section-compact)]` = `clamp(5rem, 8vw, 7rem)`
- Container max: `80rem` (1280px), padding `clamp(1.5rem, 3vw, 3rem)`
- Section 分離: 余白主体、必要時 `border-t border-border`。背景色切替は使わない
- Grid: Container Queries (`@container` + `@md:grid-cols-2 @3xl:grid-cols-3`)
- Border-radius: コンテナ / 画像 = `rounded-lg`、ボタン = sharp、セクション境界 = sharp

## Motion Design

- 定数: `@/public/lib/animations.ts` の `DURATION` / `EASE` / `STAGGER` / `PARALLAX`
- 主役: `SplitText` (chars/words/lines)
- 脇役: `ScrollReveal` (y:40 + opacity)
- 背景: `ParallaxImage` (subtle: 0.3)
- CTA: `MagneticButton` (elastic snap-back)
- 制約: 1セクションで動く要素は最大 3 箇所
- `prefers-reduced-motion: reduce` で全モーション抑制

## Component Conventions

- `Heading` コンポーネント: `font-heading text-h1`（h1/h2）/ `text-h3`（h3）/ `text-h4`（h4）のみ。font-weight は `@theme` 任せ
- カタログカード: `border border-border` sharp edge、hover で画像 opacity
- CTA: `Button variant="editorial"` 統一、シャープエッジ + bronze hover
- セクションラベル: `SectionLabel` で ゴールドライン + 11px uppercase
- PageHero variants: editorial / compact / minimal — 全て `Heading level={1}` 使用

## Forbidden Patterns

- **ハードコードカラー禁止** — セマンティックトークン（`text-foreground`, `bg-surface`, `text-accent` 等）のみ
- **`text-h1` 等に呼び出し側で `font-*` / `leading-*` / `tracking-*` を重ねない** — 例外は editorial-card featured の font-light override のみ
- **`hover:text-accent` 全要素禁止** — hover は `hover:text-foreground` 控えめ遷移、accent は静的表示のみ
- **`rounded-full` は全ボタンで禁止** — Editorial sharp edge。pill 使用は badge / アイコンボタン / スピナーのみ
- **絵文字装飾禁止** — Tabler Icons のみ
- **`bg-foreground`（ダーク全幅セクション）禁止** — Accent 10% 制約を超える、全コンテンツセクション白背景
- **hero 以外でのフル fluid clamp 見出し禁止** — セクションタイトルは `text-h2` トークン使用

## References

- `.claude/rules/frontend/project-design-config.md` — 本ドキュメントの正本（ルール版）
- `.claude/rules/frontend/anti-ai-design.md` — Anti-AI 強制ルール
- `src/app/(public)/_styles/public.css` — 実装
- `src/app/(public)/_shared/components/design-system/heading.tsx` — Heading コンポーネント実装
