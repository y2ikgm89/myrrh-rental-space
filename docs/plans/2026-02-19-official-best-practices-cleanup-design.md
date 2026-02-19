# 公式ベストプラクティス準拠クリーンアップ設計

> 2026-02-19 | 破壊的変更OK・後方互換性なし

## 目的

検証で検出された一貫性の問題を、公式ベストプラクティスに準拠した形で修正する。

## スコープ

### A. Server Actions の withPermission + createSuccess/createFailure 統一（高優先度）

**問題**: 7ファイルで手動認証・直接オブジェクトリテラル返却・ローカル型定義が混在

**修正方針**:

| ファイル | 現状 | 修正 |
|---------|------|------|
| `actions/page.ts` | 手動 `verifyAdminSession()` + 直接リテラル ~20箇所 | `withPermission` HOF + `createSuccess`/`createFailure` |
| `actions/editor-comment.ts` | 手動認証 + ローカル `ActionResult<T>` 型 | `withPermission` + canonical `ActionResult<T>` |
| `actions/fetch-ogp.ts` | 手動 `checkAdminAuth()` + ローカル `FetchOgpResult` 型 | `withPermission` + `ActionResult<OgpData>` |
| `actions/media.ts` | `checkPermission()` 使用（正しいパターンだがHOF未使用）+ import先が `@/shared` | `withPermission` + import を `@/admin/types` に |
| `actions/post-comment.ts` | 手動認証 + ローカル `AdminCommentActionResult`/`BulkDeleteResult` 型 | `withPermission` + canonical `ActionResult` |
| `actions/dashboard.ts` | 手動 `verifyAdminSession()` (read-only) | `withReadPermission` |
| `actions/audit-log.ts` | `checkAuditLogPermission()` | パターン準拠を確認、必要に応じて `withPermission` |

**破壊的変更**:
- `editor-comment.ts`: `{ success: true; data: T }` → `{ success: true; message: string; data?: T }`
- `post-comment.ts`: `AdminCommentActionResult` / `BulkDeleteResult` 削除
- `fetch-ogp.ts`: `FetchOgpResult` 削除 → `ActionResult<OgpData>`
- 各ファイルの呼び出し元で `.message` 参照が必要になる場合あり

### B. Zod 4 deprecated API 置換（中優先度）

| ファイル | 現在 | 修正 |
|---------|------|------|
| `actions/block-template.ts:122` | `z.flattenError(validated.error).formErrors[0]` | `createValidationError(validated.error)` |
| `actions/ical-tokens.ts:83` | `parsed.error.flatten().fieldErrors` | `createValidationError(parsed.error)` |

### C. 型アサーション修正（低優先度）

| ファイル | 現在 | 修正 |
|---------|------|------|
| `TagInput.tsx:215` | `e.target as Node` | `e.target instanceof Node` 型ガード |

### D. ハードコードカラー（修正なし）

以下は公式パターンまたは例外として許容:
- `bg-black/80` オーバーレイ: shadcn/ui 公式パターン
- Lexical カラープリセット: カラーピッカースウォッチ（tailwind-patterns.md 例外）
- Stripe ブランドカラー `text-[#635BFF]`: ブランドガイドライン色

## 除外

- `console.log` 使用: 違反なし（全て正当な使用）
- `server-only` import: 全18ファイル準拠済み
- クロスバウンダリ import: 違反なし

## 参照した公式ドキュメント

- Next.js: Server Actions security (authentication/authorization before mutations)
- Zod 4: `.flatten()` / `.format()` deprecated → `z.treeifyError()` 推奨
- Tailwind CSS 4: `@theme` CSS-first config, `bg-black/80` は shadcn/ui 公式パターン
- React 19: `ref` as prop (forwardRef 廃止)
