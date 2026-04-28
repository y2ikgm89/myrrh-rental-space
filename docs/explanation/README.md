# Explanation — 設計の「なぜ」

> 理解指向のドキュメント。アーキテクチャ判断、データモデル、トレードオフ、設計原則。

[Diátaxis](https://diataxis.fr/explanation/) の **explanation** に相当する。読み終えた後に「なぜそうなっているのか」が分かる状態を目指す。手順は [`../how-to/`](../how-to/) を、API 仕様は [`../reference/`](../reference/) を参照。

## ドキュメント

| ファイル                                                       | 内容                                      |
| -------------------------------------------------------------- | ----------------------------------------- |
| [architecture.md](./architecture.md)                           | 全体アーキテクチャと責務分離              |
| [project-structure.md](./project-structure.md)                 | ディレクトリ構造と配置方針                |
| [tech-stack.md](./tech-stack.md)                               | 採用技術とバージョン前提                  |
| [database-design.md](./database-design.md)                     | Prisma / PostgreSQL 設計                  |
| [caching.md](./caching.md)                                     | `use cache` / tag 運用                    |
| [data-flow.md](./data-flow.md)                                 | 公開↔管理のデータフロー解析               |
| [page-sections.md](./page-sections.md)                         | ページセクションの設計                    |
| [content-managed-pages.md](./content-managed-pages.md)         | 固定デザイン + 型付きコンテンツ編集の方針 |
| [security-model.md](./security-model.md)                       | 多層防御 / RBAC / 信用境界                |
| [ai-instructions.md](./ai-instructions.md)                     | Codex / Claude Code の正本配置            |
| [typescript-version-policy.md](./typescript-version-policy.md) | TypeScript 6.x RC / 安定版移行方針        |

## 現在の原則

- `src/app/*` は route / page / layout / route handler の orchestration に限定する
- 業務ロジックと read model は `src/shared/domain/*` を正本にする
- Prisma と Better Auth adapter の境界は `src/shared/db/*` に固定する
- auth は `/api/auth/[...all]` と `src/shared/lib/auth.ts` の静的 `auth` export を正本にする
- `proxy.ts` は coarse gate と共通セキュリティヘッダーに限定し、本認可の正本にはしない
