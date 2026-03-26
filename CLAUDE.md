# CLAUDE.md

> Myrrh Rental Space — レンタルスペース予約管理システム

## 🔴 必須（違反禁止）

### 禁止

- **型アサーション（`as`）禁止** → `type-safety.md`
- **後方互換性ハック禁止** → 不要コード完全削除
- **検証なしの完了報告禁止** → 必ず検証コマンド実行
- **曖昧な要件の推測実装禁止** → `AskUserQuestion`で確認
- **ハードコードカラー禁止** → テーマ変数使用 → `tailwind-patterns.md`

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

| 技術         | Ver    | 注意点                                                         |
| ------------ | ------ | -------------------------------------------------------------- |
| Next.js      | 16.2.1 | `'use cache'`, `updateTag`, PPR (`cacheComponents: true`)      |
| React        | 19.2.4 | Compiler 1.0, `use()`, `useEffectEvent`                        |
| TypeScript   | 6.0.2  | `target: es2025`, `erasableSyntaxOnly`, `verbatimModuleSyntax` |
| Prisma       | 7.5.0  | WASM, `createAppPrismaClient` で `$extends` 集約               |
| Tailwind CSS | 4.2.2  | CSS-first, `@theme`, セマンティックトークン必須                |
| Zod          | 4.3.6  | `{ error: }` パラメータ                                        |
| Better Auth  | 1.5.6  | RBAC, Google/LINE OAuth, accountLinking, CUSTOMER ロール       |
| Bun          | 1.3.11 | テストランナー (`bun:test`), `bunx --bun`                      |

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
```

> **フック**: Prettier + ESLint --fix（PostToolUse）/ schema-change-guard / type-check-on-stop
> **保護**: `.env*`, `bun.lock`, `prisma/migrations/*.sql` 編集不可（PreToolUse）

### コーディング規約（要点）

- Server Components 優先、Zod バリデーション必須
- 管理画面フォーム送信: `<SubmitButton isPending={isPending} label="保存" />`（`@/admin/components/ui`）
- 管理画面詳細の削除: `DetailDeleteButton` をヘッダー actions に配置（ページ最下部カード禁止）
- 複雑な管理 CRUD: `useActionState` + `FormData` + Server Action 可（`admin-ui-patterns.md`）
- 公開ページ: Page-First Architecture、Design System 直接 import（barrel 禁止）
- 公開フォーム: `usePublicForm` + Turnstile + fireAndForget メール
- 公開フォーム autoComplete: `family-name` / `given-name` / `email` / `organization` を適切に設定
- 公開フォーム個人/法人切り替え: `CustomerTypeToggle` + `customerType` Zod enum + `companyName` 条件必須 refine（`customer-type.ts` に共通化）
- ドメインコマンド戻り値: 通知/カレンダー/メール用データは `payload` で統一返却（二重返却禁止）
- ドメインコマンド内の Prisma enum: `CustomerStatus.NEW` 等の enum 定数使用（`"NEW"` 文字列リテラル禁止）
- Prisma tx 内の顧客解決: `upsert` 使用（find+create/update の手動実装禁止）
- ドメインコマンドの共通ロジック: ヘルパー関数に抽出（重複チェック・統計更新・ペイロード構築）
- 予約ステータス遷移: `RESERVATION_STATUS_TRANSITIONS`（`helpers.ts`）で一元管理。UI Select / ドメイン commands 両方で参照
- enum 拡張時: Badge, Filter, Select, Calendar色, Zod schema, 統計クエリ, カレンダー同期, seed を全確認
- Role enum 追加時: `Record<Role, ...>` 箇所（status-badges, permissions, UserForm）+ テスト（enum count）を全更新
- 公開ページ認証: `verifyCustomerSession()` で CUSTOMER ロール確認（未認証→`/login`、管理者→`/admin`）
- Customer ↔ User 紐づけ: `ensureCustomerLinked(user)` をマイページ layout で実行（`databaseHooks` 不使用）
- 公開ページ Settings クエリ: `admin-queries.ts` を import しない → `public-queries.ts` を別途作成
- Customer/Inquiry フィールド追加時: types.ts, queries.ts（全 select）, 管理画面 Form/Detail/Table, メール types, seed, テスト, カレンダー同期, ドメインコマンドの CUSTOMER_SELECT を全確認
- Zod refine 共有: 複数スキーマで同一 refine → 関数 + エラー定数を抽出して import（`customer-type.ts` が実装例）
- 複数 `useState` カスケード → `useReducer`、データ取得は `startTransition`
- 命名: 管理 `PascalCase.tsx`、公開 `kebab-case.tsx`、その他 `kebab-case.ts`
- 公開アニメーション: `scroll-reveal.tsx`, `split-text.tsx` 等 kebab-case のみ（PascalCase ラッパー削除済み）
- 公開ページ料金表記: `/h`, `/day`（英語略記で統一。`/時間` `/日` は使用しない。サイトの「日本語メイン + 英語アクセント」デザイン言語に準拠）
- 公開ページ Dialog: `@/public/components/design-system/dialog` を使用（管理画面の `@/admin/components/ui/dialog` は import しない）
- 公開ページオーバーレイカラー: `bg-overlay` + `text-overlay-foreground`（`bg-black/*` / `text-white` 禁止）
- ホバープレビューディレイ: 500ms（意図的ホバーと通過を区別する最短値。2秒は遅すぎ、即時はチラつく）
- 予約スペース選択: カード内「詳細を見る」→ Dialog でギャラリー・設備・料金表示（Booking.com 方式）。カードは `<div role="radio">` + 内部 `<button>`（ネスト `<button>` 禁止）
- コミット: `<type>(<scope>): <subject>`

ルール（`.claude/rules/`）は `paths:` フロントマターで条件付き自動ロード。
`docs/reference/codex-rules/` は CI/Codex 用コピー。正本は `.claude/rules/`。
