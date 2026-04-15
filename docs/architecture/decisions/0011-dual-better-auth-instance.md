# 11. 管理者用と顧客用で Better Auth インスタンスを完全分離する

- **Status**: Accepted
- **Date**: 2026-04-15
- **Deciders**: @y2ikgm89
- **Tags**: auth, security, architecture

## Context and Problem Statement

管理画面（`(admin)/` route group）と公開ページ（`(public)/` route group）の両方で認証が必要だが、要件は大きく異なる:

| 項目                     | 管理画面                              | 公開ページ                       |
| ------------------------ | ------------------------------------- | -------------------------------- |
| 認証方式                 | email/password                        | Google / LINE ソーシャルログイン |
| エントリ URL             | `/api/auth/*`                         | `/api/customer-auth/*`           |
| ロール                   | SUPER_ADMIN / ADMIN / EDITOR / VIEWER | CUSTOMER                         |
| セッション Cookie prefix | `admin-auth`                          | `customer-auth`                  |
| DB Adapter               | Prisma `basePrisma` (no $extends)     | 同上                             |
| セッション保持期間       | 業務時間単位                          | 長期（マイページ維持）           |

単一の Better Auth インスタンスで両方の要件を満たそうとすると、権限モデル・Cookie 名・basePath・プラグイン選定がすべて条件分岐になり、どちら側の認証も弱体化する。さらに、管理者メールで顧客が誤ってログインしたケース（cross-role bleed）の境界制御が不可能になる。

## Decision Drivers

- 管理者セッションと顧客セッションが同一ブラウザで共存しうる（管理者が公開ページをプレビュー、顧客が管理者権限を持つケース）
- cross-role bleed（顧客 cookie を管理 cookie として誤採用）を物理的に防ぐ
- 将来、管理画面に 2FA / 顧客側にソーシャル追加プロバイダーを入れる際に相互影響を避ける
- Better Auth 公式は 1 プロジェクトに複数インスタンスを置く構成をサポートしている

## Considered Options

1. **Option A**: 単一 `auth` インスタンスでロール・プロバイダーを条件分岐
2. **Option B**: 単一インスタンス + middleware で Cookie 名を動的に書き換え
3. **Option C**: `adminAuth` / `customerAuth` の 2 インスタンス完全分離

## Decision Outcome

**Chosen option**: "Option C — 2 インスタンス完全分離"、なぜなら:

- Better Auth 公式が `cookiePrefix` + `basePath` オプションで明示的に分離構成を推奨している
- Cookie prefix が物理的に異なる (`admin-auth.session_token` vs `customer-auth.session_token`) ため、片方の漏洩がもう片方に影響しない
- `adminAuth.api.getSession({ headers })` と `customerAuth.api.getSession({ headers })` を呼び分けるだけで、ミドルウェア層の動的ルーティングが不要
- ソーシャルログイン（Google / LINE）のリダイレクト URL `/api/customer-auth/callback/*` が管理画面の `/api/auth/callback/*` と衝突しない
- 管理画面の ensureCustomerLinked（User ↔ Customer 紐づけ）を顧客側にだけ適用可能

実装:

- `src/shared/lib/admin-auth.ts` — `adminAuth`（email/password、`cookiePrefix: "admin-auth"`、`basePath` デフォルト `/api/auth`）
- `src/shared/lib/customer-auth.ts` — `customerAuth`（Google/LINE、`cookiePrefix: "customer-auth"`、`basePath: "/api/customer-auth"`）
- `src/shared/db/better-auth-adapter.ts` — 両インスタンスが同じ `basePrisma`（`$extends` 前）を Prisma Adapter に渡す
- `verifyAdminSession()` / `verifyCustomerSession()` — それぞれ異なるリダイレクト先（管理者は `/`、顧客は `/login`）

### Consequences

**良い点**:

- Cookie prefix 分離による cross-role bleed の物理的防止
- プラグイン構成を両インスタンスで独立に最適化できる（`magicLink`、`twoFactor`、`organization` 等を片方だけに追加可能）
- `(admin)/` / `(public)/` の Multiple Root Layouts と認証境界が一致する
- テスト時に `adminAuth` だけモックして `customerAuth` を実モジュールのまま走らせるなどの分離検証が可能

**悪い点 / トレードオフ**:

- Better Auth インスタンスが 2 つあるため「どちらの API を呼ぶか」を常に意識する必要がある
- Prisma Adapter に渡す `basePrisma` を両インスタンスで揃える規約を守らないと、片方だけ Decimal 変換が効かないバグが発生する
- Google OAuth app はプロジェクト全体で 1 つのため、callback URL の設定に注意（公開側のみ `/api/customer-auth/callback/google`）
- ensureCustomerLinked のような User ↔ Customer 遅延紐づけは顧客側にしか適用されない（管理者側では不要だが、設計の対称性が崩れる）

### Compliance / Validation

- `.claude/rules/auth-patterns.md` — dual instance 構成の公式パターン節
- `CLAUDE.md` SSoT テーブルに両インスタンスとその cookie prefix / basePath を明記
- `architecture-boundaries.test.ts` は `adminAuth` が server-only 境界を越えないことを検証
- `e2e/` の setup project が `customer.setup.ts` / `admin.setup.ts` の 2 本に分かれている（本プロジェクトの Playwright storage state 戦略）

## Pros and Cons of the Options

### Option A: 単一インスタンス + 条件分岐

- ❌ どちら側の認証も第一級市民ではなくなる
- ❌ Cookie prefix が共通のため cross-role bleed 対策が実装依存
- ❌ プラグイン構成が互いに干渉

### Option B: 単一インスタンス + middleware 書き換え

- ❌ Better Auth 公式サポートなし
- ❌ Cookie 書き換えは SameSite / Secure / Path などの副作用が大きく脆弱
- ❌ セキュリティ監査で説明不能

### Option C: 2 インスタンス完全分離 ✅ 採用

- ✅ Better Auth 公式推奨
- ✅ Cookie 物理分離
- ✅ プラグイン独立
- ⚠️ 運用ルール（どちらを呼ぶか）を文書化する必要あり

## Links / References

- [Better Auth Multi-Instance Setup](https://www.better-auth.com/docs/concepts/database)
- [Better Auth cookiePrefix option](https://www.better-auth.com/docs/reference/options)
- 関連 files: `src/shared/lib/admin-auth.ts`, `src/shared/lib/customer-auth.ts`, `src/shared/db/better-auth-adapter.ts`
- 関連 rules: `.claude/rules/auth-patterns.md`
