# アーキテクチャ

repo 全体の構造、境界、データ取得方針、キャッシュ戦略の正本です。

## ドキュメント一覧

| ファイル                                                         | 内容                         |
| ---------------------------------------------------------------- | ---------------------------- |
| [ARCHITECTURE.md](./ARCHITECTURE.md)                             | 全体アーキテクチャと責務分離 |
| [PROJECT_STRUCTURE.md](./PROJECT_STRUCTURE.md)                   | ディレクトリ構造と配置方針   |
| [DATABASE_DESIGN.md](./DATABASE_DESIGN.md)                       | Prisma / PostgreSQL 設計     |
| [CACHING.md](./CACHING.md)                                       | `use cache` / tag 運用       |
| [TECH_STACK.md](./TECH_STACK.md)                                 | 採用技術とバージョン前提     |
| [page-sections-design-guide.md](./page-sections-design-guide.md) | ページセクション設計         |

## 現在の原則

- `src/app/*` は route / page / layout / route handler の orchestration に限定する
- 業務ロジックと read model は `src/shared/domain/*` を正本にする
- Prisma と Better Auth adapter の境界は `src/shared/db/*` に固定する
- auth は `/api/auth/[...all]` と `src/shared/lib/auth.ts` の静的 `auth` export を正本にする
- `proxy.ts` は coarse gate と共通セキュリティヘッダーに限定し、本認可の正本にはしない

最終更新: 2026-03-09
