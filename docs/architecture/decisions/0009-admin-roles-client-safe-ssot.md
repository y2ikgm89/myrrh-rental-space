# 9. admin-roles.ts を client-safe な Role SSoT として分離

- **Status**: Accepted
- **Date**: 2026-04-15
- **Deciders**: @y2ikgm89
- **Tags**: architecture, auth, bundle

## Context and Problem Statement

`DASHBOARD_ROLES` / `ROLE_LABELS` / `ROLE_DESCRIPTIONS` などの管理者ロール定数を `src/shared/lib/admin-auth.ts` に置いていたが、このファイルは Better Auth セッション検証のため `import "server-only"` を持つ。結果として以下が発生した:

- `'use client'` なスタッフ招待フォーム (`InviteForm`) やロールバッジ (`status-badges`) がロール定数を import しようとするとビルドエラー
- 各クライアントコンポーネントがローカルに `"スーパー管理者"` / `"管理者"` などの日本語ラベルを重複定義
- `DASHBOARD_ROLES` が tuple ではなく `readonly Role[]` widened 型になっていたため `z.enum()` に直接渡せず、再変換が必要だった

## Decision Drivers

- Client Component からロール SSoT を使えるようにする
- Zod 4 の `z.enum(TUPLE)` が要求する const tuple 形式で定数を提供する
- `.includes(wideType)` の TS2345 エラーを型ガードで解消する
- `admin-auth.ts` の server-only 境界は維持する（セッション検証とロール定数の責務を分離する）

## Considered Options

1. **Option A**: ロール定数だけを `"use client"` 付きの別ファイルに分離する
2. **Option B**: `admin-auth.ts` を client-safe にする（`import "server-only"` 削除）
3. **Option C**: 新規 `admin-roles.ts` モジュール（server-only なし）を canonical とし、`admin-auth.ts` が再 export する

## Decision Outcome

**Chosen option**: "Option C — `admin-roles.ts` を canonical な SSoT にする"、なぜなら:

- 定数は純粋データのため server/client 境界に依存しない → client-safe module が最も自然
- `admin-auth.ts` は引き続き server-only を保ち、認証ロジックを誤って Client Component に引き込むガードを維持
- `DASHBOARD_ROLES` を `as const satisfies readonly Role[]` で const tuple に固定すると、そのまま `z.enum(DASHBOARD_ROLES)` に渡せる（Zod 4 公式要件）
- `.includes(role)` は tuple 型に wider `Role` を渡せないため、`isDashboardRole()` 型ガード（`new Set<Role>(TUPLE).has(role)`）を公開 API として用意
- `admin-auth.ts` 側で `DASHBOARD_ROLES` を re-export することで既存の server-only import を壊さない

### Consequences

**良い点**:

- Client Component が `@/shared/lib/admin-roles` から自由に定数・ラベル・型ガードを import 可能
- `ROLE_LABELS` / `ROLE_DESCRIPTIONS` がプロジェクト全体で 1 箇所に集約（重複ハードコード撲滅）
- `z.enum(DASHBOARD_ROLES)` / `isDashboardRole()` のパターンが公式実装として参照可能
- `STAFF_INVITABLE_ROLES`（SUPER_ADMIN 除外）のような派生定数も同一ファイルに閉じる

**悪い点 / トレードオフ**:

- 定数ファイルと認証ファイルを行き来する必要がある（admin-auth.ts は依然として読み込まれるが、定数の窓口は admin-roles.ts）
- ロール追加時に `ROLE_LABELS` / `ROLE_DESCRIPTIONS` / `DASHBOARD_ROLES` のいずれを更新すべきか初見では分かりにくい（CLAUDE.md SSoT テーブルで補足）

### Compliance / Validation

- `CLAUDE.md` SSoT テーブルに `admin-roles.ts` を明示
- `.claude/rules/auth-patterns.md` の §DASHBOARD_ROLES で client/server 両側の import パターンを示す
- `.claude/rules/gotchas.md` に「client component から server-only モジュールの定数を参照禁止」「const tuple の `.includes(wideType)` は TS2345」「`z.enum(TUPLE)` は const tuple 必須」の 3 件を記載
- architecture-boundaries.test.ts は `import "server-only"` を含む Client Component を検出するため、再発は自動検出される

## Pros and Cons of the Options

### Option A: `"use client"` 付き別ファイル

- ❌ 定数は JSX/hooks を含まないため `"use client"` は意味的に誤り
- ❌ Server Component からも使うため不要なクライアント境界を発生させる

### Option B: admin-auth.ts を client-safe に

- ❌ `betterAuth()` インスタンス・`headers()` 呼び出し・Prisma adapter が全て client bundle に混入
- ❌ Better Auth 公式の server-only 推奨に反する

### Option C: 新規 client-safe モジュール ✅ 採用

- ✅ 責務分離が明確（定数 vs 認証ロジック）
- ✅ Zod 4 / React 19 Client Component / type guard すべてに自然に対応
- ⚠️ ロール定数の正本ファイルが変わったことを周知する必要あり

## Links / References

- [Zod 4 z.enum API](https://zod.dev/api#enums)
- [Next.js Server-only / Client-only](https://nextjs.org/docs/app/getting-started/server-and-client-components#preventing-environment-poisoning)
- 関連 commit: `526a7288 feat(admin-roles): client-safe role SSoT module`
- 関連 rules: `.claude/rules/auth-patterns.md`, `.claude/rules/gotchas.md`
