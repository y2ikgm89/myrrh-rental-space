---
paths:
  - src/app/(public*)/**
---

# デザインシステム記憶ルール

> **配置**: `.claude/rules/frontend/design-system-memory.md`（`paths:` フロントマター付き — public 作業時に自動適用）
> Serena memory を使用したデザイン判断の永続化。セッション間でデザイン方針を引き継ぐ。

## Memory 名

`design-system`

## 読み取りプロトコル

### 公開ページ UI 作業開始時

1. `read_memory('design-system')` を実行
2. Memory が存在する場合 → 記載された方針に従って作業開始
3. Memory が存在しない場合 → `project-design-config.md` を初期値として使用し、`/frontend-design` 実行後に memory 作成

### 読み取りタイミング

- 新規コンポーネント/セクション作成時
- 既存コンポーネントの大幅リデザイン時
- スタイル変更を伴う修正時

**例外**: 色変更・余白微調整等の小規模修正では読み取り不要

---

## Memory 構造テンプレート

Memory 作成時は以下のセクション見出しを使用。値は `project-design-config.md` から転記し、セッション中の変更を反映する。

```markdown
# Design System Decisions

## Brand Direction
- **Mood**: (project-design-config.md §ブランド から)
- **Personality**: (同上)
- **Reference URLs**: (セッション中に決定)

## Typography
(project-design-config.md §タイポグラフィ の値 + セッション中の追加決定)

## Color Allocation
(project-design-config.md §カラーパレット の値 + セッション中の追加決定)

## Spatial Design
(project-design-config.md §セクション設計 の値 + セッション中の追加決定)

## Motion Design
(project-design-config.md §モーション設計 の値 + セッション中の追加決定)

## Component Conventions
(project-design-config.md §コンポーネント規約 の値 + セッション中の追加決定)

## Forbidden Patterns
(→ anti-ai-design.md のセルフレビュー・禁止パターン参照 + セッション中に追加判明したパターン)
```

---

## 書き込みプロトコル

### 更新タイミング

| タイミング | 操作 |
|-----------|------|
| Memory 未存在 + `/frontend-design` 初回実行後 | `write_memory('design-system', ...)` で `project-design-config.md` の値を書き込み |
| ユーザーがデザイン方針を変更した時 | `edit_memory('design-system', ...)` で該当セクション更新 |
| 新コンポーネント規約が追加された時 | `edit_memory('design-system', ...)` の Component Conventions に追記 |
| 新 Forbidden Pattern が判明した時 | `edit_memory('design-system', ...)` の Forbidden Patterns に追記 |

### 更新ルール

1. **Memory の上書きは最小限** — 全体を書き換えるのではなく、変更箇所のみ `edit_memory` で更新
2. **ユーザー承認なしの方針変更禁止** — デザイン方針の変更はユーザーに確認してから Memory 更新
3. **Memory と実装の乖離禁止** — Memory に記載された方針と矛盾する実装をしない

## 参照

- `.claude/rules/project-design-config.md` — プロジェクト固有デザイン値（Memory 未作成時の初期値）
- `.claude/rules/anti-ai-design.md` — Anti-AI 強制ルール・セルフレビュー
- `.claude/skills/frontend-design/SKILL.md` — Design Brief 作成スキル
