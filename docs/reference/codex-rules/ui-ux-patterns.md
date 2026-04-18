---
paths:
  - src/app/(public*)/**
  - src/app/(admin)/**
---

# UI/UX パターンルール

> Codex 用参照ドキュメント。UI 作業ではこのファイルと `.claude/skills/` を正本とし、Claude 用 asset は参照元にしない。

## 目的

フロントエンド実装で generic な AI 生成 UI に寄らず、既存ブランドと運用に沿った判断を再現する。

## Skill マップ

| タスク                               | 使うもの                                   |
| ------------------------------------ | ------------------------------------------ |
| 公開ページの新規 UI / 大幅リデザイン | `.claude/skills/frontend-design/SKILL.md`  |
| UI の方向性調査                      | `.claude/skills/ui-ux-pro-max/SKILL.md`    |
| スクロール演出セクション             | `.claude/skills/parallax-section/SKILL.md` |
| Lexical 拡張                         | `.claude/skills/lexical-*/SKILL.md`        |

## 基本フロー

### 公開ページ

1. `project-design-config.md` と `anti-ai-design.md` を読む
2. 必要なら `ui-ux-pro-max` で方向性を検索する
3. `frontend-design` で short Design Brief を作る
4. 実装で theme token と shared primitive を使う
5. `bun run validate` を実行する

### 管理画面

1. 管理画面の固定テーマを前提にする
2. `color`, `font`, `radius` を勝手に再設計しない
3. 必要なら `ui-ux-pro-max` を review 補助に使う
4. コンポーネント実装では a11y と semantic token を優先する

## 検索コマンド

**Windows**（PowerShell / cmd）では `python3` の代わりに **`py -3`** を使う。以下の `python3` は macOS / Linux 向け。

```bash
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "hospitality editorial" --domain style
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "warm serif elegant" --domain typography
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "accessibility contrast" --domain ux
python3 .claude/skills/ui-ux-pro-max/scripts/search.py "layout responsive" --stack nextjs
```

## プロジェクト固有制約

### Multiple Root Layouts

- 公開ページと管理画面は CSS を共有しない
- 共通ロジックは `src/shared/` に閉じる
- 公開テーマは `public.css`、管理テーマは `admin.css` を正本とする

### 公開ページ

- `docs/reference/codex-rules/project-design-config.md` のブランド設定を守る
- `docs/reference/codex-rules/anti-ai-design.md` のセルフレビューを通す
- モーションは `docs/reference/codex-rules/gsap-patterns.md` に従う

### 管理画面

- Swiss Industrial Admin テーマを固定で使う
- カラートークンは semantic token を使い、 ad-hoc palette を追加しない
- 業務 UI で演出過多にしない

## 禁止事項

1. UI 方針なしで新規 UI を実装しない
2. `.claude/*` を Codex の正本として参照しない
3. グレー一色の generic card grid や、見た目だけの gradient/pill/button を量産しない
4. `gray-*`, `blue-*` などのハードコード色に逃げない
5. animation, contrast, focus, reduced-motion の確認を省略しない

## 関連

- `docs/reference/codex-rules/project-design-config.md`
- `docs/reference/codex-rules/anti-ai-design.md`
- `docs/reference/codex-rules/design-system-memory.md`
- `docs/reference/codex-rules/accessibility.md`
- `docs/reference/codex-rules/tailwind-patterns.md`
- `docs/reference/codex-rules/react-patterns.md`
