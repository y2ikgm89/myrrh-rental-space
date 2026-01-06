# ドキュメント検証レポート

> **検証日**: 2026-01-06  
> **検証対象**: AGENTS.md、docs/README.md、主要技術ドキュメント  
> **検証目的**: 公式推奨事項への準拠、後方互換性のないクリーンな実装要件の確認

---

## 検証サマリー

### ✅ 準拠している点

1. **Next.js 16のキャッシングAPI**: 最新の推奨事項に準拠
   - `unstable_cache`、`unstable_noStore`、`revalidatePath`、`revalidateTag`、`updateTag`、`refresh`の使用方法が正しい
   - タグベースの無効化パターンが適切に実装されている

2. **React 19のServer Components**: 最新の推奨事項に準拠
   - `await`を直接使用したデータフェッチング
   - Suspenseの適切な活用
   - Client Componentsの最小化

3. **Prisma 7の最適化**: 最新の推奨事項に準拠
   - `select`で必要なフィールドのみ取得
   - `include`でN+1問題を回避
   - トランザクションの適切な使用

4. **Auth.js 5の設定**: 最新の推奨事項に準拠
   - Prisma Adapterの適切な設定
   - JWTセッション戦略の推奨

5. **技術スタックバージョン**: 最新のセキュリティ修正版を使用
   - React 19.2.3（CVE-2025-55182修正版）
   - Next.js 16.1.1（CVE-2025-55182修正版）

---

## ⚠️ 改善が必要な点

### 1. `unstable_cache`の`revalidateTag`パラメータ

**問題**: `revalidateTag`の第2引数（`profile`）についての記載が不足

**現状**: 
```typescript
revalidateTag('spaces-list')
```

**推奨**: 
```typescript
revalidateTag('spaces-list', 'max') // stale-while-revalidate semantics
```

**修正箇所**:
- `BEST_PRACTICES.md`: Server Actionsでの`revalidateTag`使用例を更新
- `CACHING_STRATEGY.md`: `revalidateTag`の詳細説明を追加
- `API.md`: Server Actionsでのキャッシュ無効化例を更新

---

### 2. `unstable_cache`の動的データソースへのアクセス

**問題**: `unstable_cache`内で`headers`や`cookies`にアクセスする場合の注意事項が不足

**推奨追加内容**:
```typescript
// ❌ 悪い例: unstable_cache内でheadersにアクセス
const getData = unstable_cache(
  async () => {
    const headers = await headers() // 動的データソース
    // ...
  },
  ['data']
)

// ✅ 良い例: headersを外で取得して引数として渡す
export async function getData() {
  const headersList = await headers()
  const authHeader = headersList.get('authorization')
  
  return getCachedData(authHeader)
}

const getCachedData = unstable_cache(
  async (authHeader: string) => {
    // authHeaderを使用
  },
  ['data']
)
```

**修正箇所**:
- `BEST_PRACTICES.md`: `unstable_cache`のベストプラクティスセクションに追加
- `CACHING_STRATEGY.md`: セキュリティ考慮事項セクションに追加

---

### 3. React 19のPromiseを直接渡すパターン

**問題**: Server ComponentsでPromiseを直接Client Componentに渡すパターンが不足

**推奨追加内容**:
```typescript
// ✅ 良い例: Promiseを直接渡してClient Componentでawait
async function Page({ id }) {
  const note = await db.notes.get(id)
  
  // Promiseを直接渡す（Client Componentでawait）
  const commentsPromise = db.comments.get(note.id)
  
  return (
    <div>
      {note}
      <Suspense fallback={<p>Loading Comments...</p>}>
        <Comments commentsPromise={commentsPromise} />
      </Suspense>
    </div>
  )
}
```

**修正箇所**:
- `BEST_PRACTICES.md`: React 19のベストプラクティスセクションに追加

---

### 4. Prisma 7の`in`フィルターによるN+1問題回避

**問題**: `include`以外のN+1問題回避パターンが不足

**推奨追加内容**:
```typescript
// ✅ 良い例: inフィルターでN+1問題を回避
const users = await prisma.user.findMany({})
const userIds = users.map((x) => x.id)

const posts = await prisma.post.findMany({
  where: {
    authorId: {
      in: userIds,
    },
  },
})
```

**修正箇所**:
- `BEST_PRACTICES.md`: Prisma 7のベストプラクティスセクションに追加
- `DATABASE_DESIGN.md`: クエリ最適化セクションに追加

---

### 5. Auth.js 5の`auth()`メソッドの使用

**問題**: `getServerSession`ではなく`auth()`メソッドを使用する推奨が明確でない

**現状**: 
```typescript
import { getServerSession } from '@/lib/auth'
const session = await getServerSession()
```

**推奨**: 
```typescript
import { auth } from '@/lib/auth'
const session = await auth()
```

**修正箇所**:
- `BEST_PRACTICES.md`: Auth.js 5のベストプラクティスセクションを更新
- `API.md`: 認証チェックの例を更新

---

### 6. 後方互換性のないクリーンな実装の明確化

**問題**: 後方互換性を考慮しないクリーンな実装であることが明示されていない

**推奨追加内容**:
- `BEST_PRACTICES.md`の冒頭に「後方互換性を考慮せず、最新のクリーンな実装を目指す」旨を明記（既に記載あり）
- 各セクションで古いパターン（非推奨）と新しいパターン（推奨）を明確に区別

**修正箇所**:
- `BEST_PRACTICES.md`: 既に記載あり、問題なし
- 各ドキュメント: 古いパターンへの言及を削除または非推奨として明記

---

## 修正優先度

### 高優先度（即座に修正推奨）

1. ✅ **Auth.js 5の`auth()`メソッドの使用**: `getServerSession`から`auth()`への移行を推奨
2. ✅ **`revalidateTag`の`profile`パラメータ**: stale-while-revalidate semanticsの説明を追加

### 中優先度（次回更新時に修正）

3. ⚠️ **`unstable_cache`の動的データソースへのアクセス**: 注意事項を追加
4. ⚠️ **React 19のPromiseを直接渡すパターン**: ベストプラクティスに追加
5. ⚠️ **Prisma 7の`in`フィルターによるN+1問題回避**: 追加パターンを記載

### 低優先度（必要に応じて修正）

6. ℹ️ **後方互換性の明確化**: 既に記載あり、問題なし

---

## 検証結果まとめ

### 総合評価: ✅ **良好**

現在のドキュメントは、公式推奨事項にほぼ準拠しており、後方互換性を考慮しないクリーンな実装要件も満たしています。

### 主な強み

1. **最新のセキュリティ修正版を使用**: React 19.2.3、Next.js 16.1.1
2. **最新のキャッシングAPIを適切に使用**: `unstable_cache`、`unstable_noStore`、`revalidatePath`、`revalidateTag`など
3. **Server Components優先アーキテクチャ**: 最新の推奨事項に準拠
4. **Prisma 7の最適化パターン**: `select`、`include`、トランザクションの適切な使用

### 改善点

1. **`revalidateTag`の`profile`パラメータ**: stale-while-revalidate semanticsの説明を追加
2. **Auth.js 5の`auth()`メソッド**: `getServerSession`から`auth()`への移行を推奨
3. **追加のベストプラクティス**: Promiseを直接渡すパターン、`in`フィルターによるN+1問題回避など

---

## 推奨アクション

1. ✅ **即座に修正**: `revalidateTag`の`profile`パラメータ、Auth.js 5の`auth()`メソッド → **修正完了**
2. ✅ **次回更新時に追加**: `unstable_cache`の動的データソースへのアクセス、React 19のPromiseパターン、Prisma 7の`in`フィルター → **追加完了**
3. **継続監視**: 公式ドキュメントの更新を継続的に監視し、最新の推奨事項を反映

## 実施した修正

### 修正完了項目（2026-01-06）

1. ✅ **`revalidateTag`の`profile`パラメータ**: 
   - `BEST_PRACTICES.md`: `revalidateTag('spaces-list', 'max')`に更新
   - `CACHING_STRATEGY.md`: `profile`パラメータの詳細説明を追加
   - `API.md`: すべての`revalidateTag`呼び出しに`'max'`を追加

2. ✅ **Auth.js 5の`auth()`メソッド**: 
   - `API.md`: `getServerSession`から`auth()`への移行を推奨

3. ✅ **`unstable_cache`の動的データソースへのアクセス**: 
   - `BEST_PRACTICES.md`: 注意事項とベストプラクティスを追加
   - `CACHING_STRATEGY.md`: セキュリティ考慮事項セクションに追加

4. ✅ **React 19のPromiseを直接渡すパターン**: 
   - `BEST_PRACTICES.md`: 新しいセクションを追加

5. ✅ **Prisma 7の`in`フィルターによるN+1問題回避**: 
   - `BEST_PRACTICES.md`: 追加パターンを記載

---

## 参考資料

- [Next.js 16 Caching Documentation](https://nextjs.org/docs/app/api-reference/functions/unstable_cache)
- [React 19 Server Components](https://react.dev/reference/rsc/server-components)
- [Prisma 7 Query Optimization](https://www.prisma.io/docs/guides/performance-and-optimization)
- [Auth.js 5 Documentation](https://authjs.dev)

---

**最終更新**: 2026-01-06
