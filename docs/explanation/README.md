# Explanation — 設計の「なぜ」

> 理解指向のドキュメント。アーキテクチャ判断、データモデル、トレードオフ、設計原則。

[Diátaxis](https://diataxis.fr/explanation/) の **explanation** に相当する。読み終えた後に「なぜそうなっているのか」が分かる状態を目指す。手順は [`../how-to/`](../how-to/) を、API 仕様は [`../reference/`](../reference/) を参照。

## ドキュメント

| ファイル                                               | 内容                                                                  |
| ------------------------------------------------------ | --------------------------------------------------------------------- |
| [architecture.md](./architecture.md)                   | 全体アーキテクチャと責務分離                                          |
| [project-structure.md](./project-structure.md)         | Multiple Root Layouts の判断と層の責務                                |
| [tech-stack.md](./tech-stack.md)                       | 採用技術の判断（バージョンは `package.json` / TypeScript 移行方針含） |
| [caching.md](./caching.md)                             | PPR / `'use cache'` / タグ駆動無効化の方針                            |
| [content-managed-pages.md](./content-managed-pages.md) | 固定デザイン + 型付きコンテンツ編集の方針                             |
| [security-model.md](./security-model.md)               | 多層防御 / RBAC / 信用境界                                            |
| [ai-instructions.md](./ai-instructions.md)             | Codex / Claude Code の正本配置                                        |

**実装の SSoT**: ファイル配列・cache invalidation の最新状態・Prisma スキーマは実コードを ground truth にする（`src/` / `prisma/schema.prisma` / `.claude/rules/**`）。本ディレクトリには手動メンテのファイル列挙やスキーマミラーを置かない（drift の温床になるため）。

## 現在の原則（要約）

アプリ層と domain の責務分離などの全体原則は [architecture.md](./architecture.md) を参照。この README は索引に徹する。
