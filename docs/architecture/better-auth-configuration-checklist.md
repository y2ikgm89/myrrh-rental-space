# Better Auth 設定チェックリスト（公式準拠）

再監査時は [Better Auth ドキュメント](https://www.better-auth.com/docs) と突き合わせる。

## 実装正本

- [`src/shared/lib/auth.ts`](../../src/shared/lib/auth.ts) — **`betterAuth({ ... })` の単一インスタンス**を `export const auth`。
- [`src/shared/db/better-auth-adapter.ts`](../../src/shared/db/better-auth-adapter.ts) — **`prismaAdapter` には拡張前 `basePrisma` のみ**。

## 必須項目（現行方針）

| 項目                           | 期待                                              |
| ------------------------------ | ------------------------------------------------- |
| `advanced.database.generateId` | `"uuid"`（DB `@db.Uuid` と整合）                  |
| `baseURL`                      | `BETTER_AUTH_URL` または `getAppUrl()` 由来で明示 |
| `database`                     | Prisma アダプタ（Kysely 併用なし）                |
| `plugins`                      | `nextCookies()` は **配列末尾**                   |
| 動的 `getAuth()`               | **再導入禁止**（静的 `auth` export のみ）         |

## RBAC / サーバー側

- 管理系 mutation は `executeAdminMutationResult` + `checkPermission` パターン（[auth-patterns.md](../../.claude/rules/auth-patterns.md)）。
