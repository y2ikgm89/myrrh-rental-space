# Documentation

> Myrrh Rental Space — レンタルスペース予約管理システムの技術ドキュメント

## 構造（Diátaxis）

このドキュメントは [Diátaxis](https://diataxis.fr/) フレームワークに準拠する。「なぜ」「手順」を分離し、読者の目的別に配置する。

```
docs/
├── explanation/    # 設計の「なぜ」(理解指向) — アーキテクチャ判断、トレードオフ
├── how-to/         # 手順 (問題解決指向) — デプロイ、特定タスクの解決
├── guides/         # 運用ガイド (機能セットアップ手順)
├── superpowers/    # ワークフロー連動の plans / specs
└── templates/      # ドキュメントテンプレート
```

**ライブラリ API リファレンスは公式 docs を直接参照**（Diátaxis: reference）。project 固有のパターン・規約は `.claude/rules/**`（Claude Code）と `.agents/skills/**`（Codex）が SSoT。

## クイックリンク

| カテゴリ                       | 何が書いてあるか                                       | 目的                         |
| ------------------------------ | ------------------------------------------------------ | ---------------------------- |
| [explanation/](./explanation/) | 設計の判断・データフロー・モデル                       | 「なぜそうなっているか」     |
| [how-to/](./how-to/)           | デプロイ、移行、特定タスクの実行手順                   | 「どうすればいいか」         |
| [guides/](./guides/)           | 機能セットアップ手順（外部連携・運用フロー）           | 「どう設定するか」           |
| [superpowers/](./superpowers/) | brainstorming / plans ワークフロー由来のドラフト・計画 | 「いつ・何を」の実装進行ログ |
| [templates/](./templates/)     | ドキュメントテンプレート                               | 新規 doc / plan の雛形       |

## 読者別ガイド

| 読者         | 入口                                                                                                                                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 新規開発者   | [AGENTS.md](../AGENTS.md) → [explanation/architecture.md](./explanation/architecture.md) → [project-structure.md](./explanation/project-structure.md) → [tech-stack.md](./explanation/tech-stack.md) |
| インフラ     | [how-to/deploy.md](./how-to/deploy.md), [docker.md](./how-to/docker.md), [cloudflare.md](./how-to/cloudflare.md), [harden-protection.md](./how-to/harden-protection.md)                              |
| セキュリティ | [explanation/security-model.md](./explanation/security-model.md), [how-to/harden-protection.md](./how-to/harden-protection.md)                                                                       |
| AI 設定      | [explanation/ai-instructions.md](./explanation/ai-instructions.md)                                                                                                                                   |

## 技術スタックとコード規約

- **確定バージョンの正本**: [`package.json`](../package.json) + [`bun.lock`](../bun.lock)。
- **採用理由の説明**: [explanation/tech-stack.md](./explanation/tech-stack.md)。
- **日常的な実装規約・コマンド**: [AGENTS.md](../AGENTS.md)（Codex）と [`CLAUDE.md`](../CLAUDE.md)（Claude Code）。

Codex と Claude Code の資産境界・相互参照禁止は [explanation/ai-instructions.md](./explanation/ai-instructions.md)。
