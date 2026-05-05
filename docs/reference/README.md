# Reference — 仕様

> 情報指向のドキュメント。「何が使えるか / どう動くか」の事実を並べる。

[Diátaxis](https://diataxis.fr/reference/) の **reference** に相当する。手順や設計判断は別カテゴリへ。読者は必要な箇所だけを引きに来る前提で、網羅性と検索性を優先する。

このディレクトリの内容は **AI エージェント共通**（Codex / Claude Code 両方の rule から参照）で、特定の AI 専用ではない。

## ドキュメント

### Bun

| ファイル                           | 内容                                   |
| ---------------------------------- | -------------------------------------- |
| [bun-runtime.md](./bun-runtime.md) | Bun ランタイム設定・運用知識           |
| [bun-test.md](./bun-test.md)       | bun:test API・モック・スナップショット |

### React / アニメーション

| ファイル                                         | 内容                                 |
| ------------------------------------------------ | ------------------------------------ |
| [react-api.md](./react-api.md)                   | React 19.2 新 API・Compiler 制限事項 |
| [gsap.md](./gsap.md)                             | GSAP プラグイン・効果別実装パターン  |
| [micro-interactions.md](./micro-interactions.md) | マイクロインタラクション標準         |

## 引き方

- **Claude Code rule から**: `.claude/rules/{bun-patterns,react/hooks,frontend/gsap+anti-ai-design,ui-ux-pro-max}` の本文末尾から `docs/reference/<file>.md` を参照
- **Codex skill から**: `.agents/skills/<name>/SKILL.md` の reference セクションで参照
