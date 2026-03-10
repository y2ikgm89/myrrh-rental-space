# 029: 型エラー・ビルドエラー修正

## 概要

type-check で発生していた `isSystemPage` 関連のエラーと、build で発生していた Next.js 16 PPR エラーを修正。

## 問題

### 1. isSystemPage 型エラー

**エラー内容**:

```
Property 'isSystemPage' is missing in type '...' but required in type 'PageData'.
Object literal may only specify known properties, and 'isSystemPage' does not exist in type 'PageCreateInput'.
```

**原因**:

- `prisma/schema.prisma` に `isSystemPage` フィールドが定義されていたが、マイグレーションが作成されていなかった
- Prisma クライアントが古く、スキーマと同期していなかった

### 2. Server Actions での同期関数エラー

**エラー内容**:

```
Server Actions must be async functions.
```

**原因**:

- `src/actions/admin/page.ts` に同期関数 `canDeletePage()` が定義されていた
- `'use server'` ディレクティブのあるファイルでは、エクスポートされる関数はすべて async である必要がある

### 3. Next.js 16 PPR new Date() エラー

**エラー内容**:

```
Route "/contact" used `new Date()` before accessing either uncached data or Request data.
```

**原因**:

- `generateMetadata` 内で Prisma クエリを実行
- Next.js 16 PPR では、プリレンダリング時に `new Date()` が使用されると（Prisma の内部ログ等で）エラーになる
- `'use cache'` ディレクティブでキャッシュ化することで回避が必要

## 解決策

### 1. Prisma マイグレーション作成

```bash
bunx prisma migrate dev --name add_is_system_page_to_pages
```

**生成されたマイグレーション**: `20260115154941_add_is_system_page_to_pages`

### 2. canDeletePage 関数の移動

**変更前**: `src/actions/admin/page.ts` （Server Actions ファイル）
**変更後**: `src/lib/validations/page.ts` （ユーティリティファイル）

```typescript
// src/lib/validations/page.ts に追加
export function canDeletePage(slug: string): boolean {
  return !isSystemPageSlug(slug);
}
```

### 3. getPageSeo に 'use cache' 追加

**変更ファイル**: `src/lib/page-metadata.ts`

```typescript
// Before: React.cache() を使用
export const getPageSeo = cache(async (slug: string) => {
  const page = await prisma.page.findUnique({...})
  return page
})

// After: 'use cache' ディレクティブを使用
export async function getPageSeo(slug: string): Promise<PageSeoData | null> {
  'use cache'
  cacheLife('hours')
  cacheTag('page-seo', `page-seo-${slug}`)

  const page = await prisma.page.findUnique({...})
  return page
}
```

## 変更ファイル

| ファイル                                                        | 変更内容                                                                 |
| --------------------------------------------------------------- | ------------------------------------------------------------------------ |
| `prisma/migrations/20260115154941_add_is_system_page_to_pages/` | 新規マイグレーション                                                     |
| `src/actions/admin/page.ts`                                     | `canDeletePage` 削除、`isSystemPageSlug` インポート削除                  |
| `src/lib/validations/page.ts`                                   | `canDeletePage` 関数追加                                                 |
| `src/lib/page-metadata.ts`                                      | `'use cache'` ディレクティブ追加、`React.cache()` → `cacheLife/cacheTag` |

## テスト結果

- [x] type-check 成功
- [x] lint 成功
- [x] build 成功

## Next.js 16 PPR 対応のベストプラクティス

1. **generateMetadata 内でのデータ取得**:
   - Prisma クエリなどの動的データアクセスは `'use cache'` でラップ
   - または `connection()` を先に呼び出す

2. **Server Actions ファイル**:
   - エクスポートする関数はすべて `async` にする
   - 同期ユーティリティ関数は別ファイルに移動

3. **キャッシュ戦略**:
   - SEO データなど頻繁に変わらないデータは `cacheLife('hours')` でキャッシュ
   - `cacheTag` で細かい revalidation 制御
