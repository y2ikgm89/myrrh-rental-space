# Explanation — 設計の「なぜ」

> 理解指向のドキュメント。アーキテクチャ判断、データモデル、トレードオフ、設計原則。

[Diátaxis](https://diataxis.fr/explanation/) の **explanation** に相当する。読み終えた後に「なぜそうなっているのか」が分かる状態を目指す。手順は [`../how-to/`](../how-to/) を、API 仕様は [`../reference/`](../reference/) を参照。

## ドキュメント

| ファイル                                                       | 内容                                            |
| -------------------------------------------------------------- | ----------------------------------------------- |
| [architecture.md](./architecture.md)                           | 全体アーキテクチャと責務分離                    |
| [project-structure.md](./project-structure.md)                 | Multiple Root Layouts の判断と層の責務          |
| [tech-stack.md](./tech-stack.md)                               | 採用技術の判断（バージョンは `AGENTS.md` 参照） |
| [caching.md](./caching.md)                                     | PPR / `'use cache'` / タグ駆動無効化の方針      |
| [content-managed-pages.md](./content-managed-pages.md)         | 固定デザイン + 型付きコンテンツ編集の方針       |
| [security-model.md](./security-model.md)                       | 多層防御 / RBAC / 信用境界                      |
| [ai-instructions.md](./ai-instructions.md)                     | Codex / Claude Code の正本配置                  |
| [typescript-version-policy.md](./typescript-version-policy.md) | TypeScript 6.x RC / 安定版移行方針              |

**実装の SSoT**: ファイル配列・cache invalidation の最新状態・Prisma スキーマは実コードを ground truth にする（`src/` / `prisma/schema.prisma` / `.claude/rules/**`）。本ディレクトリには手動メンテのファイル列挙やスキーマミラーを置かない（drift の温床になるため）。

## 現在の原則

- `src/app/*` は route / page / layout / route handler の orchestration に限定する
- 業務ロジックと read model は `src/shared/domain/*` を正本にする
- Prisma と Better Auth adapter の境界は `src/shared/db/*` に固定する
- auth は `/api/auth/[...all]` と `src/shared/lib/auth.ts` の静的 `auth` export を正本にする
- `proxy.ts` は coarse gate と共通セキュリティヘッダーに限定し、本認可の正本にはしない
