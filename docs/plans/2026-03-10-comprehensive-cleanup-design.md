# プロジェクト包括的クリーンアップ

**日付**: 2026-03-10
**種別**: リファクタリング | 破壊的変更
**ステータス**: 完了（2026-04-14）

---

## 概要

プロジェクト全体を公式ベストプラクティスに完全準拠させる包括的クリーンアップ。
後方互換性を維持せず、クリーンな実装に統一する。

## 対象一覧

### Phase 1: 破壊的アーキテクチャ変更

#### 1.1 ActionResult → MutationResult パターン統一

**現状**: 2パターンが共存

- `executeAdminMutation` → `ActionResult<T>`（旧）: 10ファイル
- `executeAdminMutationResult` → `MutationResult<T>`（新）: 25ファイル

**変更**:

- `executeAdminMutation` を廃止し `executeAdminMutationResult` に統一
- 旧パターンの10ファイルを新パターンに移行
- `ActionResult<T>` 型と `createSuccess()` / `createFailure()` を削除
- Client Component 側の `useFormAction` フックを `MutationResult` 対応に統一

**対象ファイル（旧パターン → 移行必要）**:

- `actions/space.ts`
- `actions/media.ts`
- `actions/editor-comment.ts`
- `actions/post-comment.ts`
- `actions/staff-invitation.ts`
- `actions/inquiry.ts`
- `actions/user.ts`
- `actions/location.ts`
- `actions/space-category.ts`
- `actions/page-section.ts`

**関連ファイル**:

- `_shared/lib/admin-action.ts` — `executeAdminMutation` 関数を削除
- `_shared/types/server-actions.ts` — `ActionResult`, `ActionSuccess`, `ActionFailure` 型を削除
- `@/shared/types/server-actions.ts` — 同上
- `_shared/hooks/useFormAction.ts` — `MutationResult` のみ対応に簡素化
- 呼び出し元の Client Component（フォーム等）を新しい返り値に合わせて調整

#### 1.2 `uuid` パッケージ削除 → `crypto.randomUUID()`

**現状**: `uuid@^13.0.0` がインストールされているが使用は1箇所のみ
**変更**:

- `src/shared/lib/storage.ts` の `import { v4 as uuid } from 'uuid'` → `crypto.randomUUID()`
- `package.json` から `uuid` と `@types/uuid` を削除

### Phase 2: Next.js 16 ベストプラクティス適合

#### 2.1 公開ページに NuqsAdapter 追加

**現状**: 管理画面 layout には配置済みだが `src/app/(public)/layout.tsx` に未配置
**変更**: nuqs-patterns.md に従い `<Suspense><NuqsAdapter>{children}</NuqsAdapter></Suspense>` を追加

#### 2.2 公開ページに `connection()` 追加

**現状**: 管理画面の56ページで `await connection()` 使用済み。公開ページは0ファイル
**変更**: `src/app/(public)/` 配下の全 `page.tsx` と `generateMetadata` で `await connection()` を追加
**対象**: 公開ページの全 Server Component ページ関数を監査し、動的データアクセスの前に配置

### Phase 3: テスト・CI/CD 改善

#### 3.1 CI にテスト実行追加

**現状**: `cloudbuild.yaml` にテスト実行ステップなし
**変更**: Docker ビルド前に `bun run test:all` ステップを追加

#### 3.2 Dockerfile で `build:strict` 使用

**現状**: `SKIP_ENV_VALIDATION=true` でビルド
**変更**: 本番ビルドでは環境変数バリデーション有りに変更

- Dockerfile の builder ステージで `SKIP_ENV_VALIDATION` を削除
- Secret Manager から必要な環境変数を Docker build-time に注入

#### 3.3 tsconfig の `__tests__` include 化

**現状**: `__tests__/` が exclude されており `tsc --noEmit` でテストの型エラーを検出不可
**変更**:

- `tsconfig.json` の `exclude` から `__tests__` を削除
- テスト用の型定義（`bun:test` 等）を `tsconfig.json` に追加
- 型エラーがあれば修正

### Phase 4: 設定・ツールチェーン改善

#### 4.1 Prettier 設定の明示化

**現状**: `.prettierrc` / `.prettierignore` がプロジェクトルートに未作成
**変更**:

- `.prettierrc.json` 作成（現在のデフォルト設定を明文化）
- `.prettierignore` 作成（generated/, bun.lock, cloudbuild.yaml 等）

#### 4.2 console.log 禁止 ESLint ルール追加

**現状**: src/ 内に5件の `console.log` / `console.warn` 等が残存
**変更**:

- `eslint.config.mjs` に `no-console: ["warn", { allow: ["warn", "error"] }]` を追加
- 既存の `console.log` を `logError` 等の適切なロガーに置換

#### 4.3 Docker ビルドタイムアウト短縮

**現状**: cloudbuild.yaml の timeout が 1800s（30分）
**変更**: 600s（10分）に短縮。ビルドは通常5分以内に完了

#### 4.4 minor パッケージアップグレード

- `isomorphic-dompurify` 3.0.0 → 3.1.0
- パッチレベルの @types/\* 更新

## 実装順序

1. Phase 1（破壊的変更）→ 最も影響範囲が大きいため最初に
2. Phase 2（Next.js 16 適合）→ PPR ビルドエラー防止
3. Phase 3（テスト・CI/CD）→ 品質保証インフラ
4. Phase 4（設定改善）→ DX 向上

## リスク

| リスク                                              | 対策                                                               |
| --------------------------------------------------- | ------------------------------------------------------------------ |
| ActionResult 統一で Client Component の型エラー多発 | useFormAction フックを先に修正し、呼び出し元の影響を最小化         |
| `connection()` 追加で公開ページのキャッシュ動作変更 | 追加後に `bun run build` で静的/動的判定を確認                     |
| tsconfig include 変更で大量の型エラー               | `bun run type-check` で事前確認、段階的修正                        |
| Dockerfile strict build で CI 失敗                  | Secret Manager の環境変数を Docker build-time に渡す設定を事前確認 |

## 検証

各 Phase 完了後:

- `bun run validate` (type-check + lint)
- `bun run test:all` (unit + integration)
- `bun run build` (ビルド成功確認)
