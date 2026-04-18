---
paths:
  - src/app/(public*)/**
---

# デザインシステム記録ルール

> Codex 用参照ドキュメント。永続化が必要なデザイン判断は hidden memory ではなく、このリポジトリの文書に残す。

## 正本

- 現在のブランド設定: `docs/reference/codex-rules/project-design-config.md`
- 実装時の anti-pattern: `docs/reference/codex-rules/anti-ai-design.md`
- UI 作業の流れ: `.claude/skills/frontend-design/SKILL.md`

## 読み取りプロトコル

公開ページ UI を触る前に次を確認する。

1. `project-design-config.md`
2. `anti-ai-design.md`
3. 必要に応じて `ui-ux-patterns.md`, `gsap-patterns.md`

## 更新プロトコル

### `project-design-config.md` を更新する場合

- ブランドのムードが変わった
- color allocation や typography の正本が変わった
- 再利用すべき component convention が増えた
- motion hierarchy を project-wide に変えた

### 別のルール文書を更新する場合

- 新しい forbidden pattern を見つけた
- UI 実装フロー自体を変えた
- アニメーションや a11y の共通判断を増やした

## ルール

- Codex では `read_memory`, `write_memory`, `edit_memory` のような hidden state を前提にしない
- project-wide な判断は承認後にドキュメントへ反映する
- 一時的な実験や局所的な装飾差分を global rule に昇格させない
- 更新は最小差分で行い、既存の意味を壊さない

## チェックリスト

- 変更が本当に project-wide か
- 既存ルールと衝突していないか
- `project-design-config.md` で済むのか、別ルール文書に分けるべきか
- 実装とドキュメントが乖離していないか
