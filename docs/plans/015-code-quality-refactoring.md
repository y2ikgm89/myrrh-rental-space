# 015: コード品質リファクタリング

## 概要

プロジェクト全体のコード品質向上を目的としたリファクタリング。公式ベストプラクティスに準拠し、重複コードの削除とtailwind-variants (TV)への統一を実施。

## 実装内容

### 1. Server Actionヘルパー統一

**課題**: Turnstile検証とZodバリデーションエラー抽出が5+ファイルで重複

**解決策**: 共通ヘルパー関数を作成

- `extractFieldErrors()` - ZodErrorからフィールドエラーマップを生成
- `createValidationError()` - バリデーションエラーレスポンス生成
- `validateTurnstile()` - Turnstile検証フロー
- `withTurnstile()` - Turnstile検証付きServer Action実行
- `withValidation()` - Zodバリデーション付きServer Action実行
- `withTurnstileAndValidation()` - 両方を組み合わせたServer Action実行

### 2. React 19フック作成

**課題**: React 19のuseActionState/useFormStatusが未活用

**解決策**: フォーム送信用カスタムフックを作成

- `useFormSubmission()` - useActionStateをラップした状態管理フック
- `useFormPending()` - useFormStatusのエイリアス（送信ボタン用）

### 3. Admin UI CVA→TV統一

**課題**: class-variance-authority (CVA)とtailwind-variants (TV)が混在

**解決策**: 全てのAdmin UIコンポーネントをTVに統一

- `button.tsx` - CVA→TV変換
- `badge.tsx` - CVA→TV変換
- `label.tsx` - バリアントなしのため単純な文字列定数に簡略化
- `dropdown-menu.tsx` - CVA→TV変換

### 4. Server Actionsリファクタリング

新しいヘルパーを使用してServer Actionsをリファクタリング:

- `contact.ts` - `withTurnstileAndValidation()`使用
- `reservation.ts` - `validateTurnstile()` + `extractFieldErrors()`使用（動的スキーマ選択のため）
- `blog-comment.ts` - 条件付きTurnstile検証 + `extractFieldErrors()`使用

### 5. パッケージ削除

- `class-variance-authority` パッケージを完全削除

## 新規ファイル

- `src/lib/action-helpers.ts` - Server Actionヘルパー関数
- `src/hooks/use-form-submission.ts` - React 19フォームフック

## 変更ファイル

- `src/components/admin/ui/button.tsx` - CVA→TV
- `src/components/admin/ui/badge.tsx` - CVA→TV
- `src/components/admin/ui/label.tsx` - 簡略化（バリアントなし）
- `src/components/admin/ui/dropdown-menu.tsx` - CVA→TV
- `src/actions/contact.ts` - ヘルパー使用
- `src/actions/reservation.ts` - ヘルパー使用
- `src/actions/blog-comment.ts` - ヘルパー使用
- `package.json` - CVAパッケージ削除
- `bun.lock` - 更新

## アーキテクチャ方針

### UI分離

- **Admin UI** (`src/components/admin/ui/`): 顧客共通、tailwind-variants使用
- **Public UI** (`src/components/site/`): 顧客ごとにカスタマイズ可能

### ヘルパーパターン

```typescript
// 単純なフォーム送信
export async function submitContact(input: ContactInput, token?: string) {
  return withTurnstileAndValidation(
    token,
    contactSchema,
    input,
    async (data) => {
      // ビジネスロジック
      return { success: true, message: "送信しました" };
    },
  );
}

// 動的スキーマやカスタムロジックが必要な場合
export async function createReservation(
  input: ReservationInput,
  token?: string,
) {
  const turnstileResult = await validateTurnstile(token);
  if (!turnstileResult.success) {
    return { success: false, error: turnstileResult.error };
  }

  const schema = condition ? schemaA : schemaB;
  const validation = schema.safeParse(input);
  if (!validation.success) {
    return {
      success: false,
      fieldErrors: extractFieldErrors(validation.error),
    };
  }

  // ビジネスロジック
}
```

## 検証

- [x] type-check通過
- [x] lint通過
- [x] build成功
- [x] code-simplifier実行
- [x] code-reviewer実行

## 既知の問題（スコープ外）

code-reviewerが以下の既存問題を検出（今回のリファクタリング対象外）:

1. **予約のTOCTOU問題**: 重複チェックがトランザクション外（既存コード）
2. **ゲストメール公開**: CommentAuthor型にメールが含まれる（既存設計）
3. **バックグラウンド処理の静的失敗**: メール/カレンダー同期のエラー処理（既存パターン）

## マイグレーション

不要（スキーマ変更なし）
