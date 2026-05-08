# Documentation

> Myrrh Rental Space — レンタルスペース予約管理システムの技術ドキュメント

## 構造（Diátaxis）

このドキュメントは [Diátaxis](https://diataxis.fr/) フレームワークに準拠する。「なぜ」「手順」「仕様」を分離し、読者の目的別に配置する。

```
docs/
├── explanation/    # 設計の「なぜ」(理解指向) — アーキテクチャ判断、トレードオフ
├── how-to/         # 手順 (問題解決指向) — デプロイ、特定タスクの解決
├── reference/      # 仕様 (情報指向) — API、ライブラリ、ランタイム詳細
├── superpowers/    # ワークフロー連動の plans / specs（恒久仕様は explanation / reference へ）
└── templates/      # ドキュメントテンプレート
```

## クイックリンク

| カテゴリ                       | 何が書いてあるか                                                         | 目的                         |
| ------------------------------ | ------------------------------------------------------------------------ | ---------------------------- |
| [explanation/](./explanation/) | 設計の判断・データフロー・モデル                                         | 「なぜそうなっているか」     |
| [how-to/](./how-to/)           | デプロイ、移行、特定タスクの実行手順                                     | 「どうすればいいか」         |
| [reference/](./reference/)     | ランタイム / ライブラリ API の詳細仕様                                   | 「何が使えるか」             |
| [superpowers/](./superpowers/) | brainstorming / plans ワークフロー由来のドラフト・計画（アーカイブ含む） | 「いつ・何を」の実装進行ログ |
| [templates/](./templates/)     | ドキュメントテンプレート                                                 | 新規 doc / plan の雛形       |

## 読者別ガイド

| 読者         | 入口                                                                                                                                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 新規開発者   | [AGENTS.md](../AGENTS.md) → [explanation/architecture.md](./explanation/architecture.md) → [project-structure.md](./explanation/project-structure.md) → [tech-stack.md](./explanation/tech-stack.md) |
| インフラ     | [how-to/deploy.md](./how-to/deploy.md), [docker.md](./how-to/docker.md), [cloudflare.md](./how-to/cloudflare.md), [harden-protection.md](./how-to/harden-protection.md)                              |
| セキュリティ | [explanation/security-model.md](./explanation/security-model.md), [how-to/harden-protection.md](./how-to/harden-protection.md), [better-auth-checklist.md](./how-to/better-auth-checklist.md)        |
| AI 設定      | [explanation/ai-instructions.md](./explanation/ai-instructions.md)                                                                                                                                   |

## 技術スタックとコード規約

- **確定バージョンの正本**: [AGENTS.md#tech-stack](../AGENTS.md#tech-stack) と [`bun.lock`](../bun.lock)。
- **採用理由の説明**: [explanation/tech-stack.md](./explanation/tech-stack.md)。
- **日常的な実装規約・コマンド**: [AGENTS.md](../AGENTS.md)（および Claude Code 作業時はルート [`CLAUDE.md`](../CLAUDE.md)）。

Codex と Claude Code の資産境界・相互参照禁止は [explanation/ai-instructions.md](./explanation/ai-instructions.md)。

---

最終更新: 2026-05-08
