# 049-type-safety-improvements.md

型安全性改善 - 公式ベストプラクティス準拠

## 概要

プロジェクト全体の型定義と型安全性を調査し、以下の問題点を特定。
公式のベストプラクティスに準拠した最新推奨でクリーンな実装に改善。

## 現状評価: 8.5/10

| 項目 | 評価 |
|------|------|
| tsconfig設定 | 10/10 ✓ |
| 型定義構造 | 9/10 ✓ |
| Zodスキーマ | 9/10 ✓ |
| Server Actions | 9/10 ✓ |
| 型ガード | 9/10 ✓ |
| Error Handling | 8/10 ⚠️ |
| Generics活用 | 7/10 ⚠️ |
| import type使用率 | 7/10 ⚠️ |

## 改善タスク

### Phase 1: JSONフィールド型定義 `cc:DONE`

**対象ファイル:**
- `src/shared/types/json-fields.ts` (新規)
- `src/shared/types/index.ts` (更新)
- `src/admin/actions/location.ts`
- `src/admin/lib/validations/location.ts`

**内容:**
- `BusinessHours` 型を具体的に定義（TimeSlot, DayOfWeek含む）
- `isBusinessHours()`, `parseBusinessHours()` 型ガード作成
- `businessHoursToJson()` Prisma変換ヘルパー作成
- location関連ファイルで `Record<string, unknown>` → `BusinessHours` に置換

### Phase 2: FormDataヘルパー `cc:DONE`

**対象ファイル:**
- `src/shared/lib/form-data.ts` (新規)
- `src/shared/lib/index.ts` (新規)

**内容:**
- 型安全なFormDataヘルパー関数群を作成:
  - `getFormString()`, `getFormStringOrDefault()`, `getFormStringRequired()`
  - `getFormNumber()`, `getFormNumberOrDefault()`
  - `getFormBoolean()`, `getFormFile()`

### Phase 3: エラーハンドリング統一 `cc:SKIP`

**理由:** 既存の `ActionResult<T>` パターンが十分に型安全。過剰な抽象化を避ける。

### Phase 4: 型ガード改善 `cc:DONE`

**対象ファイル:**
- `src/shared/lib/validations/enums.ts`

**内容:**
- 全15個の型ガードから `as Enum` アサーションを削除
- Set-based O(1) lookup に改善
- パラメータを `string` → `unknown` に変更（より安全）

### Phase 5: 検証 `cc:DONE`

```bash
bun run type-check && bun run lint && bun run build
# 全て成功
```

## 完了条件

- [x] BusinessHours の `Record<string, unknown>` を具体的な型に置換
- [x] FormDataヘルパー関数を作成
- [x] 型ガードから不要なasを削除
- [x] type-check/lint/build 成功
