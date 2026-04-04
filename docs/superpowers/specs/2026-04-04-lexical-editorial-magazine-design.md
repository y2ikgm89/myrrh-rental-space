# Lexical Content Blocks — Editorial Magazine 化

> 日付: 2026-04-04
> ステータス: 設計承認済み

## 概要

`lexical-content.css`（1,366行）のカスタムブロック出力スタイルを Editorial Magazine（Kinfolk/Cereal）デザインに統一する。破壊的変更を許容し、後方互換性ハックなしのクリーンな実装。

## 対象ファイル

`src/shared/styles/lexical-content.css` — admin.css / public.css 両方から `@import` される共有 CSS。

## 設計原則

Editorial Magazine の視覚原則を `lexical-content.css` に適用:

| 原則                | 適用                                                  |
| ------------------- | ----------------------------------------------------- |
| Sharp edge 基調     | `border-radius: 0` をデフォルト。円形 badge のみ例外  |
| Shadow 不使用       | `box-shadow` 全廃止。`border` のみで区切り            |
| Semibold（700→600） | `font-weight: 700` → `600` に統一                     |
| Serif italic        | PullQuote テキストに `font-family: var(--font-serif)` |
| Gradient 不使用     | `linear-gradient` 削除                                |
| 控えめな装飾        | `border` + `color-mix` のみで色面を表現               |

## ブロック別変更仕様

### Steps（5 variant: numbered, big, small, icon, timeline）

| 変更箇所                        | 現状      | 変更後               |
| ------------------------------- | --------- | -------------------- |
| badge `border-radius`           | `9999px`  | 維持（円形は機能的） |
| numbered/small `font-weight`    | `700`     | `600`                |
| big style `border-radius`       | `0.5rem`  | `0`                  |
| big badge `font-weight`         | `700`     | `600`                |
| square modifier `border-radius` | `0.25rem` | `0`                  |

### Collapsible（4 variant: default, minimal, card, filled）

| 変更箇所                                        | 現状                             | 変更後                                             |
| ----------------------------------------------- | -------------------------------- | -------------------------------------------------- |
| radius プリセット（sm/md/lg）                   | `0.25rem` / `0.5rem` / `0.75rem` | **全削除**                                         |
| card `box-shadow`                               | `0 1px 3px ...`                  | **`border: 1px solid var(--color-border)`** に置換 |
| card title first-child `border-radius: inherit` | inherit                          | 削除（親が sharp のため不要）                      |

### Tabs（4 variant: underline, pills, boxed, minimal）

| 変更箇所                      | 現状                          | 変更後                                           |
| ----------------------------- | ----------------------------- | ------------------------------------------------ |
| container `border-radius`     | `0.5rem`                      | `0`                                              |
| pills tablist `border-radius` | `0.5rem`                      | `0`                                              |
| pills tab `border-radius`     | `0.375rem`                    | `0`                                              |
| pills active `box-shadow`     | `0 1px 3px color-mix(...)`    | **削除**                                         |
| boxed tab `border-radius`     | `0.375rem 0.375rem 0 0`       | `0`                                              |
| boxed active `box-shadow`     | `inset 0 2px 0 var(--accent)` | **`border-top: 2px solid var(--accent)`** に置換 |

### Callout（4 type: info, warning, error, success）

| 変更箇所        | 現状     | 変更後 |
| --------------- | -------- | ------ |
| `border-radius` | `0.5rem` | `0`    |

### PullQuote（3 variant: classic, modern, minimal）

| 変更箇所               | 現状                             | 変更後                   |
| ---------------------- | -------------------------------- | ------------------------ |
| テキスト `font-family` | なし（sans-serif 継承）          | `var(--font-serif)` 追加 |
| テキスト `font-weight` | `500`                            | `400`                    |
| modern `background`    | `linear-gradient(to right, ...)` | **削除**                 |

### Button（3 variant: primary, secondary, outline）

| 変更箇所             | 現状           | 変更後                                  |
| -------------------- | -------------- | --------------------------------------- |
| 共通 `border-radius` | `0.375rem`     | variant 別に分離                        |
| primary              | `0.375rem`     | `9999px`（rounded-full）                |
| secondary            | `0.375rem`     | `9999px`（rounded-full）                |
| outline              | `0.375rem`     | `0`（sharp editorial）                  |
| outline hover        | `bg-muted`     | `bg-accent` + `color-accent-foreground` |
| outline border       | `border-color` | `var(--color-foreground)`               |

### Bookmark

| 変更箇所        | 現状     | 変更後 |
| --------------- | -------- | ------ |
| `border-radius` | `0.5rem` | `0`    |

### Image

| 変更箇所            | 現状     | 変更後 |
| ------------------- | -------- | ------ |
| img `border-radius` | `0.5rem` | `0`    |

### Embeds（YouTube, Vimeo, X, Instagram, Spotify, Figma）

| 変更箇所                         | 現状     | 変更後 |
| -------------------------------- | -------- | ------ |
| YouTube iframe `border-radius`   | `0.5rem` | `0`    |
| X iframe `border-radius`         | `0.5rem` | `0`    |
| Instagram iframe `border-radius` | `0.5rem` | `0`    |
| Spotify iframe `border-radius`   | `12px`   | `0`    |
| Vimeo iframe `border-radius`     | `0.5rem` | `0`    |

### TOC

| 変更箇所        | 現状               | 変更後 |
| --------------- | ------------------ | ------ |
| `border-radius` | `var(--radius-lg)` | `0`    |

### 変更なし

- **AccentColor システム** — 色定義は Editorial と直交
- **Layout Container** — 装飾なし、構造のみ
- **Tooltip** — dotted underline（機能的）
- **Page Break** — dashed border（機能的）
- **Table** — 既に sharp
- **Prose Integration リセット** — 機能的 CSS

## テスト方針

1. `bun run validate` — 型・lint 通過
2. `bun run build` — ビルド通過
3. 各ブロックの管理画面プレビューで視覚確認（Playwright MCP）

## リスク

- **既存コンテンツの見た目が変わる** — 許容済み（破壊的変更 OK）
- **Collapsible radius プリセット削除** — DB に `data-collapsible-radius="md"` 等が保存されている場合、CSS が効かなくなるだけで表示は壊れない（sharp にフォールバック）
