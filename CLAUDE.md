# CLAUDE.md

> Myrrh Rental Space — レンタルスペース予約管理システム

## 🔴 必須（違反禁止）

### 禁止

- **型アサーション（`as`）禁止** → `type-safety.md`
- **`'use cache'` 関数での直接 prisma 呼び出し禁止** → `safeFetch` + `toPlainObject`/`toPlainArray` 必須 → `server-actions.md`
- **後方互換性ハック禁止** → 不要コード完全削除
- **検証なしの完了報告禁止** → 必ず検証コマンド実行
- **曖昧な要件の推測実装禁止** → `AskUserQuestion`で確認
- **ハードコードカラー禁止** → テーマ変数使用 → `tailwind-patterns.md`
- **公開フォームの不統一禁止** → 間隔 `space-y-6`/`Stack gap="lg"`、エラー `<div role="alert">` + border スタイル
- **ソフトデリート `where` 漏れ禁止** → Reservation の全 `findUnique`/`findFirst`/`findMany`/`update` に `deletedAt: null`（`restoreReservationCommand` 除く）→ `gotchas.md`

### 検証（完了報告前に必須）

| タイミング    | コマンド                            |
| ------------- | ----------------------------------- |
| 作業中        | `bun run type-check`                |
| 完了報告前    | `bun run validate`                  |
| コミット/PR前 | `bun run validate && bun run build` |

---

## 🟡 ワークフロー

> **セッション継続時**: `docs/plans/README.md` を確認

```
要件確認 → 調査 → 設計 → 計画 → 実装(TDD) → 検証 → レビュー → 完了
```

スキル（`.claude/skills/`）・エージェント（`.claude/agents/`）・MCP（`.mcp.json`）は自動検出。
`description` でトリガー条件を判定し、該当時に自動呼び出し。

---

## 🟢 プロジェクト情報

### 技術スタック

| 技術         | Ver    | 注意点                                                                  |
| ------------ | ------ | ----------------------------------------------------------------------- |
| Next.js      | 16.2.1 | `'use cache'`, `updateTag`, PPR (`cacheComponents: true`)               |
| React        | 19.2.4 | Compiler 1.0 (`react-compiler-runtime` 必須), `use()`, `useEffectEvent` |
| TypeScript   | 6.0.2  | `target: es2025`, `erasableSyntaxOnly`, `verbatimModuleSyntax`          |
| Prisma       | 7.6.0  | WASM, `createAppPrismaClient` で `$extends` 集約                        |
| Tailwind CSS | 4.2.2  | CSS-first, `@theme`, セマンティックトークン必須                         |
| Tabler Icons | 3.41   | `@tabler/icons-react`, `Icon` プレフィックス, 型: `TablerIcon`          |
| Zod          | 4.3.6  | `{ error: }` パラメータ                                                 |
| Better Auth  | 1.5.6  | RBAC, Google/LINE OAuth, accountLinking, CUSTOMER ロール                |
| Stripe       | 21     | Checkout Session, Webhook（`payment_status` チェック必須）              |
| Bun          | 1.3.11 | テストランナー (`bun:test`), `bunx --bun`                               |

### コマンド

```bash
bun dev                                       # 開発サーバー
bun run validate                              # type-check → lint
bun run validate && bun run build             # 完全検証
bun run test                                  # テスト（bunfig.toml preload: JSDOM）
bun run test:unit                             # Unit テストのみ
bun run test:integration                      # Integration テストのみ
bunx --bun prisma migrate dev --name <name>   # マイグレーション
bun prisma/seed.ts                            # Seed（createAppPrismaClient 適用）
bun run e2e                                   # E2E テスト（Playwright）
bun scripts/generate-login-url.ts             # Admin Gate ログインURL生成
```

> **フック**: Prettier + ESLint --fix（PostToolUse）/ schema-change-guard / type-check-on-stop
> **保護**: `.env*`, `bun.lock`, `prisma/migrations/*.sql` 編集不可（PreToolUse）

### コーディング規約

`.claude/rules/` に `paths:` フロントマターで条件付き自動ロード。
`docs/reference/codex-rules/` は CI/Codex 用コピー。正本は `.claude/rules/`。

### セキュリティ多層防御

| 層             | 公開フォーム                    | 公開クエリ                        | 管理ログイン                             | 管理 Server Actions          | API Routes           |
| -------------- | ------------------------------- | --------------------------------- | ---------------------------------------- | ---------------------------- | -------------------- |
| Admin Gate     | —                               | —                                 | `proxy.ts`（トークン/cookie/セッション） | —                            | —                    |
| Rate Limit     | `formSubmitRateLimiter` (5/min) | `publicQueryRateLimiter` (30/min) | —                                        | —                            | `proxy.ts` (100/min) |
| 認証           | —                               | —                                 | Better Auth                              | `executeAdminMutationResult` | `checkPermission`    |
| CAPTCHA        | Turnstile                       | —                                 | —                                        | —                            | —                    |
| バリデーション | Zod                             | Zod                               | —                                        | Zod                          | Zod                  |
