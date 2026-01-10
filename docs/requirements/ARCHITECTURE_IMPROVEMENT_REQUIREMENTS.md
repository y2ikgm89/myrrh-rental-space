# アーキテクチャ改善要件定義書

> **Note**: このドキュメントには、Next.js 16、React 19、Prisma 7の最新公式ベストプラクティスに準拠したアーキテクチャ改善の詳細な要件定義が記載されています。実装は行わず、要件定義のみを記載します。

**最終更新**: 2026-01-08

## 実装方針

**後方互換性を考慮しないクリーンな実装**: このプロジェクトは、最新の公式ベストプラクティスに準拠したクリーンでモダンな実装を優先します。古いバージョンや非推奨APIとの後方互換性は維持しません。すべての実装は、フレームワークとライブラリの最新の安定版を使用し、レガシーな回避策なしに公式推奨事項に従う必要があります。

---

## 1. 現状分析

### 1.1 現状のアーキテクチャの強み

#### 1.1.1 技術スタックの最新性

- **Next.js 16.1.1**: App Routerの基本実装が完了
- **React 19.2.3**: Server Components優先アーキテクチャの基盤が確立
- **Prisma 7.2.0**: 型安全なデータベースアクセス層が実装済み
- **Auth.js 5**: 認証・認可システムが統合済み
- **Bun 1.3.5**: フルBunランタイムで実行可能

#### 1.1.2 アーキテクチャパターン

- **Server Components優先**: デフォルトでServer Componentsを使用
- **キャッシング戦略**: 基本的なキャッシング戦略が実装済み
- **型安全性**: TypeScriptによる型安全性の確保
- **セキュリティ**: 基本的なセキュリティ対策が実装済み

### 1.2 改善が必要な領域

#### 1.2.1 React 19の最新機能の活用不足

**現状**:
- `use()`フックの未使用
- Promiseを直接Client Componentに渡すパターンの未実装
- Server Componentsでの直接データフェッチングの一部未実装

**影響**:
- パフォーマンス最適化の機会損失
- ユーザー体験の向上余地
- コードの複雑性の増加

#### 1.2.2 Suspense境界の最適化不足

**現状**:
- ページ全体でSuspense境界を設定している箇所がある
- データフェッチング単位での細かいSuspense境界の不足
- Streaming SSRの最適化不足

**影響**:
- ローディング状態の粒度が粗い
- ユーザー体験の低下
- パフォーマンスの最適化余地

#### 1.2.3 エラーバウンダリの体系化不足

**現状**:
- ルートレベルのエラーバウンダリのみ実装
- ページレベル・コンポーネントレベルのエラーバウンダリの不足
- エラーハンドリングの統一性不足

**影響**:
- エラー発生時のユーザー体験の低下
- エラーの原因特定の困難
- エラーログの一元管理の不足

#### 1.2.4 キャッシング戦略の階層化不足

**現状**:
- 基本的なキャッシング戦略は実装済み
- キャッシュ階層の明確化不足
- stale-while-revalidate semanticsの未徹底

**影響**:
- キャッシュ無効化のタイミングの最適化不足
- ユーザー体験とパフォーマンスの両立の余地

#### 1.2.5 パフォーマンスモニタリングの不足

**現状**:
- パフォーマンスモニタリングツールの未統合
- Web Vitalsの計測不足
- データベースクエリパフォーマンスの監視不足

**影響**:
- パフォーマンス問題の早期発見の困難
- 最適化の優先順位決定の困難

#### 1.2.6 型安全性の徹底不足

**現状**:
- TypeScript Strict Modeの一部未有効化
- 一部の関数で明示的な型注釈の不足
- `any`型の使用箇所の存在

**影響**:
- 型安全性の低下
- 実行時エラーのリスク増加
- コードの保守性の低下

---

## 2. 改善要件

### 2.1 React 19の最新機能活用

#### 2.1.1 Promiseを直接Client Componentに渡すパターン

**要件ID**: REQ-REACT-001

**要件名**: Promiseを直接Client Componentに渡して`use()`で解決するパターンの実装

**詳細仕様**:

1. **Server ComponentでのPromise作成**
   - Server ComponentでPromiseを作成し、Client Componentに直接渡す
   - 重要なデータは`await`で取得し、重要でないデータはPromiseとして渡す
   - Suspenseと組み合わせてローディング状態を管理

2. **Client ComponentでのPromise解決**
   - `use()`フックを使用してPromiseを解決
   - エラーハンドリングを適切に実装
   - Suspense fallback UIを提供

3. **適用範囲**
   - ブログ記事のコメント表示
   - 予約ページの空き状況表示
   - 管理画面の統計情報表示
   - その他、重要でないデータの遅延読み込みが必要な箇所

**実装例**:

```typescript
// Server Component
async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params // Next.js 16ではparamsはPromise

  // 重要なデータはawaitで取得
  const post = await prisma.blogPost.findUnique({
    where: { slug }
  })
  
  if (!post) {
    notFound()
  }
  
  // Promiseを直接渡す（Client Componentでawait）
  const commentsPromise = prisma.comment.findMany({ 
    where: { postId: post.id } 
  })
  
  return (
    <article>
      <h1>{post.title}</h1>
      <BlogContent content={post.content} />
      <Suspense fallback={<CommentsLoading />}>
        <Comments commentsPromise={commentsPromise} />
      </Suspense>
    </article>
  )
}

// Client Component
'use client'
import { use } from 'react'

function Comments({ commentsPromise }: { commentsPromise: Promise<Comment[]> }) {
  const comments = use(commentsPromise)
  return (
    <div>
      {comments.map(comment => (
        <CommentItem key={comment.id} comment={comment} />
      ))}
    </div>
  )
}
```

**成功基準**:
- Promiseを直接渡すパターンが3箇所以上で実装されている
- Suspenseと組み合わせてローディング状態が適切に管理されている
- エラーハンドリングが適切に実装されている

**検証方法**:
- コードレビューで実装を確認
- ブラウザの開発者ツールでローディング状態を確認
- エラー発生時の動作を確認

#### 2.1.2 Server Componentsでの直接データフェッチング

**要件ID**: REQ-REACT-002

**要件名**: Server Componentsでの直接データフェッチングの徹底

**詳細仕様**:

1. **`useEffect`でのデータフェッチングの排除**
   - Client Componentでの`useEffect`によるデータフェッチングを排除
   - Server Componentsで直接`await`を使用してデータを取得

2. **データフェッチングとUIのco-location**
   - データフェッチングとUIを同一コンポーネントに配置
   - データ取得ロジックの分散を避ける

3. **適用範囲**
   - すべての公開ページ
   - 管理画面の一覧ページ
   - データフェッチングを行うすべてのコンポーネント

**成功基準**:
- `useEffect`でのデータフェッチングが0件である
- すべてのデータフェッチングがServer Componentsで実装されている
- データフェッチングとUIが適切にco-locationされている

**検証方法**:
- コードベース全体で`useEffect`の使用箇所を検索
- データフェッチングの実装をレビュー
- パフォーマンステストで確認

### 2.2 Suspense境界の最適化

#### 2.2.1 粒度の細かいSuspense境界

**要件ID**: REQ-SUSPENSE-001

**要件名**: データフェッチング単位でのSuspense境界の設定

**詳細仕様**:

1. **Suspense境界の粒度**
   - ページ全体ではなく、データフェッチング単位でSuspense境界を設定
   - 各データフェッチングに適切なfallback UIを提供
   - 並列データフェッチングを`Promise.all`と組み合わせ

2. **Fallback UIの設計**
   - 各データフェッチングに適切なスケルトンUIを提供
   - ローディング状態が明確に分かるようにする
   - アクセシビリティを考慮した実装

3. **適用範囲**
   - ダッシュボード
   - ブログ一覧ページ
   - スペース詳細ページ
   - その他、複数のデータフェッチングを行うページ

**実装例**:

```typescript
export default async function DashboardPage() {
  return (
    <div>
      <h1>ダッシュボード</h1>
      <Suspense fallback={<StatsSkeleton />}>
        <Stats />
      </Suspense>
      <Suspense fallback={<ReservationsSkeleton />}>
        <RecentReservations />
      </Suspense>
      <Suspense fallback={<UsersSkeleton />}>
        <RecentUsers />
      </Suspense>
    </div>
  )
}
```

**成功基準**:
- データフェッチング単位でSuspense境界が設定されている
- 各Suspense境界に適切なfallback UIが提供されている
- 並列データフェッチングが適切に実装されている

**検証方法**:
- コードレビューで実装を確認
- ブラウザの開発者ツールでローディング状態を確認
- パフォーマンステストで確認

#### 2.2.2 Streaming SSRの最適化

**要件ID**: REQ-SUSPENSE-002

**要件名**: Streaming SSRの最適化

**詳細仕様**:

1. **重要度に基づくストリーミング**
   - 重要でないデータは後からストリーミング
   - 重要なデータ（メタデータ、基本情報）は優先的にレンダリング
   - ユーザー体験を損なわない範囲でストリーミング

2. **ストリーミングの優先順位**
   - 最優先: ページの基本構造、メタデータ
   - 高優先: 主要コンテンツ
   - 中優先: 補助的なコンテンツ
   - 低優先: 統計情報、関連コンテンツ

3. **適用範囲**
   - ブログ記事ページ
   - スペース詳細ページ
   - ダッシュボード
   - その他、複数のデータソースを使用するページ

**成功基準**:
- 重要なデータが優先的にレンダリングされている
   - First Contentful Paint (FCP) < 1.8秒
   - Largest Contentful Paint (LCP) < 2.5秒
- ストリーミングが適切に実装されている
- ユーザー体験が向上している

**検証方法**:
- Web Vitalsでパフォーマンスを計測
- ブラウザの開発者ツールでストリーミングを確認
- ユーザビリティテストを実施

### 2.3 エラーバウンダリの体系化

#### 2.3.1 階層的なエラーバウンダリ

**要件ID**: REQ-ERROR-001

**要件名**: 階層的なエラーバウンダリの実装

**詳細仕様**:

1. **エラーバウンダリの階層**
   - **ルートレベル**: アプリケーション全体のエラー（`app/error.tsx`）
   - **ページレベル**: ページ固有のエラー（`app/[route]/error.tsx`）
   - **コンポーネントレベル**: コンポーネント固有のエラー（必要に応じて）

2. **エラーバウンダリの実装**
   - Next.jsの`error.tsx`ファイルを使用
   - エラー情報の表示
   - リセット機能の提供
   - エラーログの記録

3. **適用範囲**
   - すべての動的ルート
   - データフェッチングを行うすべてのページ
   - エラーが発生する可能性があるすべてのコンポーネント

**実装例**:

```typescript
// app/error.tsx (ルートレベル)
'use client'
import { useEffect } from 'react'
import { ErrorBoundary } from '@/components/ErrorBoundary'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // エラーログを記録
    console.error('Root error:', error)
  }, [error])

  return <ErrorBoundary error={error} reset={reset} />
}

// app/blog/[slug]/error.tsx (ページレベル)
'use client'
import { useEffect } from 'react'
import { BlogPostErrorBoundary } from '@/components/blog/BlogPostErrorBoundary'

export default function BlogPostError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // エラーログを記録
    console.error('Blog post error:', error)
  }, [error])

  return <BlogPostErrorBoundary error={error} reset={reset} />
}
```

**成功基準**:
- ルートレベル、ページレベル、コンポーネントレベルのエラーバウンダリが実装されている
- エラー発生時に適切なエラーメッセージが表示される
- エラーログが適切に記録されている

**検証方法**:
- 意図的にエラーを発生させて動作を確認
- エラーログの記録を確認
- エラーバウンダリの実装をレビュー

#### 2.3.2 エラーハンドリングの統一

**要件ID**: REQ-ERROR-002

**要件名**: エラーハンドリングの統一

**詳細仕様**:

1. **Server Actionsでのエラーハンドリング**
   - エラーレスポンス形式の標準化
   - エラータイプの分類（バリデーションエラー、認証エラー、サーバーエラーなど）
   - エラーメッセージの統一

2. **エラーログの一元管理**
   - エラーログの構造化（JSON形式）
   - エラーログレベルの明確化（error, warn, info, debug）
   - エラーログの集約と分析

3. **クライアントサイドでのエラーハンドリング**
   - エラーメッセージの表示方法の統一
   - エラー状態の管理方法の統一
   - エラー回復機能の提供

**成功基準**:
- エラーハンドリングが統一されている
- エラーログが一元管理されている
- エラーメッセージが適切に表示されている

**検証方法**:
- エラーハンドリングの実装をレビュー
- エラーログの記録を確認
- エラーメッセージの表示を確認

### 2.4 キャッシング戦略の階層化

#### 2.4.1 キャッシュ階層の明確化

**要件ID**: REQ-CACHE-001

**要件名**: キャッシュ階層の明確化と実装

**詳細仕様**:

1. **キャッシュ階層の定義**
   - **L1: 静的コンテンツ** (`revalidate: false`)
     - プライバシーポリシー、利用規約など
     - ビルド時に生成、手動無効化まで有効
   - **L2: ISR** (`revalidate: <seconds>`)
     - ブログ記事、お知らせ、スペース詳細
     - 時間ベースの再生成
   - **L3: タグベースキャッシュ** (`unstable_cache` + `revalidateTag`)
     - スペース一覧、ブログ一覧
     - タグベースの無効化に対応
   - **L4: 動的コンテンツ** (`unstable_noStore()`)
     - 予約ページ、管理画面
     - キャッシュしない、毎回最新データを取得

2. **各階層の実装**
   - 各ページ・コンポーネントに適切なキャッシュ戦略を適用
   - キャッシュキーとタグの命名規則を統一
   - キャッシュ無効化のタイミングを明確化

3. **適用範囲**
   - すべての公開ページ
   - 管理画面
   - データフェッチングを行うすべてのコンポーネント

**実装例**:

```typescript
// L1: 静的コンテンツ
export const revalidate = false

// L2: ISR
export const revalidate = 3600

// L3: タグベースキャッシュ
const getSpaces = unstable_cache(
  async () => { /* ... */ },
  ['spaces'],
  { tags: ['spaces-list'], revalidate: 3600 }
)

// L4: 動的コンテンツ
export default async function ReservationPage() {
  unstable_noStore()
  // ...
}
```

**成功基準**:
- 4つのキャッシュ階層が明確に定義されている
- 各ページ・コンポーネントに適切なキャッシュ戦略が適用されている
- キャッシュ無効化が適切に実装されている

**検証方法**:
- キャッシュ戦略の実装をレビュー
- キャッシュの動作を確認
- パフォーマンステストで確認

#### 2.4.2 stale-while-revalidate semanticsの徹底

**要件ID**: REQ-CACHE-002

**要件名**: stale-while-revalidate semanticsの徹底

**詳細仕様**:

1. **`revalidateTag`の第2引数に`'max'`を指定**
   - 古いコンテンツを即座に表示し、バックグラウンドで更新
   - ユーザー体験とパフォーマンスの両立

2. **適用範囲**
   - スペース更新時
   - ブログ記事更新時
   - ナビゲーション更新時
   - サイト設定更新時
   - その他、コンテンツ更新時に即座に反映が必要な箇所

**実装例**:

```typescript
export async function updateSpace(id: string, data: UpdateSpaceData) {
  await prisma.space.update({
    where: { id },
    data,
  })

  // stale-while-revalidate semantics
  revalidateTag('spaces-list', 'max')
  revalidatePath('/spaces')
  revalidatePath(`/spaces/${id}`)
}
```

**成功基準**:
- `revalidateTag`の第2引数に`'max'`が指定されている
- 古いコンテンツが即座に表示され、バックグラウンドで更新されている
- ユーザー体験が向上している

**検証方法**:
- キャッシュ無効化の実装をレビュー
- ブラウザの開発者ツールでキャッシュの動作を確認
- パフォーマンステストで確認

### 2.5 パフォーマンス最適化

#### 2.5.1 バンドルサイズの最適化

**要件ID**: REQ-PERF-001

**要件名**: バンドルサイズの最適化

**詳細仕様**:

1. **動的インポートの徹底**
   - Three.js、Pixi.js、GSAPなどの大きなライブラリは動的インポート
   - ルートベースのコード分割
   - Tree-shakingの最適化

2. **バンドルサイズの目標**
   - 初期バンドルサイズ: < 200KB (gzipped)
   - 各ルートのバンドルサイズ: < 100KB (gzipped)
   - 動的インポートされたライブラリ: 必要時のみロード

3. **適用範囲**
   - すべての大きなライブラリ
   - 使用頻度の低いコンポーネント
   - 管理画面と公開ページの分離

**実装例**:

```typescript
const ThreeJSComponent = dynamic(
  () => import('@/components/public/ThreeJSComponent'),
  { ssr: false, loading: () => <Loading /> }
)
```

**成功基準**:
- 初期バンドルサイズが200KB (gzipped)以下である
- 動的インポートが適切に実装されている
- Tree-shakingが適切に機能している

**検証方法**:
- `bun run build`でバンドルサイズを確認
- ブラウザの開発者ツールでバンドルサイズを確認
- パフォーマンステストで確認

#### 2.5.2 画像最適化戦略の明確化

**要件ID**: REQ-PERF-002

**要件名**: 画像最適化戦略の明確化

**詳細仕様**:

1. **Next.js Imageコンポーネントの徹底使用**
   - すべての画像でNext.js `Image`コンポーネントを使用
   - Supabase Storageとの統合
   - WebP形式への自動変換
   - レスポンシブ画像の提供

2. **画像最適化の目標**
   - 画像の読み込み時間: < 1秒
   - 画像のファイルサイズ: 適切な圧縮
   - レスポンシブ画像の提供

3. **適用範囲**
   - すべての画像表示
   - スペース画像
   - ブログ記事画像
   - OGP画像

**成功基準**:
- すべての画像でNext.js `Image`コンポーネントが使用されている
- 画像の読み込み時間が1秒以下である
- レスポンシブ画像が適切に提供されている

**検証方法**:
- コードレビューで実装を確認
- ブラウザの開発者ツールで画像の読み込みを確認
- パフォーマンステストで確認

#### 2.5.3 コード分割戦略

**要件ID**: REQ-PERF-003

**要件名**: コード分割戦略の最適化

**詳細仕様**:

1. **ルートベースのコード分割**
   - Next.jsの自動コード分割を活用
   - 各ルートで必要なコードのみロード

2. **コンポーネントベースの動的インポート**
   - 使用頻度の低いコンポーネントは動的インポート
   - 条件付きレンダリングされるコンポーネントは動的インポート

3. **管理画面と公開ページの分離**
   - 管理画面と公開ページのコードを分離
   - 管理画面のコードは公開ページではロードしない

**成功基準**:
- ルートベースのコード分割が適切に機能している
- コンポーネントベースの動的インポートが適切に実装されている
- 管理画面と公開ページのコードが分離されている

**検証方法**:
- コードレビューで実装を確認
- ブラウザの開発者ツールでコード分割を確認
- パフォーマンステストで確認

### 2.6 セキュリティアーキテクチャの強化

#### 2.6.1 セキュリティヘッダーの設定

**要件ID**: REQ-SEC-001

**要件名**: セキュリティヘッダーの設定

**詳細仕様**:

1. **セキュリティヘッダーの設定**
   - `next.config.js`でセキュリティヘッダーを設定
   - CSP（Content Security Policy）の適切な設定
   - HSTS、X-Frame-Optionsなどの設定

2. **設定するヘッダー**
   - `X-DNS-Prefetch-Control`: DNSプリフェッチの制御
   - `Strict-Transport-Security`: HSTSの設定
   - `X-Frame-Options`: クリックジャッキング対策
   - `X-Content-Type-Options`: MIMEタイプスニッフィング対策
   - `X-XSS-Protection`: XSS対策
   - `Referrer-Policy`: リファラー情報の制御
   - `Content-Security-Policy`: CSPの設定

3. **適用範囲**
   - すべてのページ
   - すべてのAPI Routes

**実装例**:

```typescript
// next.config.js
const securityHeaders = [
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-XSS-Protection', value: '1; mode=block' },
  { key: 'Referrer-Policy', value: 'origin-when-cross-origin' },
  {
    key: 'Content-Security-Policy',
    value: [
      "default-src 'self'",
      "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: https:",
      "font-src 'self' data:",
      "connect-src 'self' https:",
    ].join('; '),
  },
]
```

**成功基準**:
- すべてのセキュリティヘッダーが設定されている
- CSPが適切に設定されている
- セキュリティスキャンで問題が検出されない

**検証方法**:
- セキュリティヘッダーの設定を確認
- セキュリティスキャンツールで確認
- ブラウザの開発者ツールでヘッダーを確認

#### 2.6.2 CSRF対策の強化

**要件ID**: REQ-SEC-002

**要件名**: CSRF対策の強化

**詳細仕様**:

1. **Server ActionsのCSRF保護**
   - Next.js標準機能によるCSRF保護
   - フォーム送信時のCSRFトークン検証
   - SameSite Cookieの設定

2. **CSRF対策の実装**
   - Auth.jsの内蔵CSRF保護を活用
   - SameSite Cookieの設定
   - CSRFトークンの検証

3. **適用範囲**
   - すべてのServer Actions
   - すべてのフォーム送信
   - すべてのAPI Routes

**成功基準**:
- CSRF対策が適切に実装されている
- CSRF攻撃に対する保護が機能している
- セキュリティスキャンで問題が検出されない

**検証方法**:
- CSRF対策の実装をレビュー
- セキュリティスキャンツールで確認
- ペネトレーションテストで確認

#### 2.6.3 レート制限の実装

**要件ID**: REQ-SEC-003

**要件名**: レート制限の実装

**詳細仕様**:

1. **レート制限の実装**
   - API Routesでのレート制限
   - Server Actionsでのレート制限
   - IPベースのレート制限

2. **レート制限の設定**
   - 認証エンドポイント: 10リクエスト/10秒
   - フォーム送信: 5リクエスト/分
   - API Routes: 100リクエスト/分
   - その他、エンドポイントごとに適切な設定

3. **適用範囲**
   - すべてのAPI Routes
   - すべてのServer Actions
   - 認証エンドポイント
   - フォーム送信エンドポイント

**実装例**:

```typescript
import { Ratelimit } from '@upstash/ratelimit'
import { Redis } from '@upstash/redis'

const ratelimit = new Ratelimit({
  redis: Redis.fromEnv(),
  limiter: Ratelimit.slidingWindow(10, '10 s'),
})

export async function createReservation(data: ReservationData) {
  const headersList = await headers() // Next.js 15+ではheaders()はPromise
  const ip = headersList.get('x-forwarded-for') ?? 'unknown'
  const { success } = await ratelimit.limit(ip)
  
  if (!success) {
    throw new Error('Rate limit exceeded')
  }
  // ...
}
```

**成功基準**:
- レート制限が適切に実装されている
- レート制限が適切に機能している
- DDoS攻撃に対する保護が機能している

**検証方法**:
- レート制限の実装をレビュー
- レート制限の動作を確認
- 負荷テストで確認

### 2.7 モニタリングとオブザーバビリティ

#### 2.7.1 エラートラッキング

**要件ID**: REQ-MON-001

**要件名**: エラートラッキングの統合

**詳細仕様**:

1. **エラートラッキングサービスの統合**
   - Sentryまたは類似サービスの統合
   - Server Componentsでのエラートラッキング
   - Client Componentsでのエラートラッキング
   - エラーコンテキストの収集

2. **エラートラッキングの設定**
   - エラーレベルの設定
   - エラーコンテキストの収集
   - エラー通知の設定

3. **適用範囲**
   - すべてのエラー
   - Server Components
   - Client Components
   - API Routes
   - Server Actions

**成功基準**:
- エラートラッキングサービスが統合されている
- エラーが適切に記録されている
- エラー通知が適切に機能している

**検証方法**:
- エラートラッキングの実装をレビュー
- エラーの記録を確認
- エラー通知の動作を確認

#### 2.7.2 パフォーマンスモニタリング

**要件ID**: REQ-MON-002

**要件名**: パフォーマンスモニタリングの統合

**詳細仕様**:

1. **パフォーマンスモニタリングの統合**
   - Next.js Analyticsの統合
   - Web Vitalsの計測
   - データベースクエリパフォーマンスの監視
   - サーバーレスポンスタイムの監視

2. **計測するメトリクス**
   - **Web Vitals**: FCP, LCP, CLS, FID, TTFB
   - **データベース**: クエリ実行時間、クエリ数
   - **サーバー**: レスポンスタイム、エラー率
   - **バンドル**: バンドルサイズ、ロード時間

3. **適用範囲**
   - すべてのページ
   - すべてのAPI Routes
   - すべてのデータベースクエリ

**成功基準**:
- パフォーマンスモニタリングが統合されている
- Web Vitalsが適切に計測されている
   - FCP < 1.8秒
   - LCP < 2.5秒
   - CLS < 0.1
   - FID < 100ms
   - TTFB < 800ms
- データベースクエリパフォーマンスが監視されている

**検証方法**:
- パフォーマンスモニタリングの実装をレビュー
- Web Vitalsの計測を確認
- パフォーマンスダッシュボードで確認

#### 2.7.3 ログ戦略

**要件ID**: REQ-MON-003

**要件名**: ログ戦略の実装

**詳細仕様**:

1. **構造化ログの採用**
   - JSON形式のログ
   - ログレベルの明確化（error, warn, info, debug）
   - ログコンテキストの収集

2. **ログ出力の最適化**
   - 本番環境でのログ出力の最適化
   - ログの集約と分析
   - ログの保存期間の設定

3. **適用範囲**
   - すべてのサーバーサイドコード
   - エラーログ
   - アクセスログ
   - パフォーマンスログ

**成功基準**:
- 構造化ログが実装されている
   - JSON形式のログ
   - ログレベルの明確化
   - ログコンテキストの収集
- ログが適切に集約されている
- ログが適切に分析されている

**検証方法**:
- ログ戦略の実装をレビュー
- ログの出力を確認
- ログの集約と分析を確認

### 2.8 型安全性の向上

#### 2.8.1 TypeScript Strict Modeの徹底

**要件ID**: REQ-TYPE-001

**要件名**: TypeScript Strict Modeの徹底

**詳細仕様**:

1. **TypeScript Strict Modeの有効化**
   - `tsconfig.json`でstrict modeを有効化
   - すべてのstrictオプションを有効化
   - 型エラーの解消

2. **型注釈の徹底**
   - すべての関数に明示的な型注釈
   - `any`型の使用禁止
   - 型定義の一元管理

3. **適用範囲**
   - すべてのTypeScriptファイル
   - すべての関数
   - すべての変数

**成功基準**:
- TypeScript Strict Modeが有効化されている
- すべての関数に明示的な型注釈がある
- `any`型の使用が0件である

**検証方法**:
- `tsconfig.json`の設定を確認
- `bun run type-check`で型エラーがないことを確認
- コードレビューで型注釈を確認

#### 2.8.2 型定義の統一

**要件ID**: REQ-TYPE-002

**要件名**: 型定義の統一

**詳細仕様**:

1. **型定義の統一**
   - Prisma生成型の活用
   - Zodスキーマからの型推論
   - 型定義の重複排除

2. **型定義の管理**
   - 型定義の一元管理
   - 型定義の命名規則の統一
   - 型定義のドキュメント化

3. **適用範囲**
   - すべての型定義
   - すべてのスキーマ定義
   - すべてのAPIレスポンス

**実装例**:

```typescript
import { z } from 'zod'
import { createSpaceSchema } from '@/lib/validations/space'

type CreateSpaceInput = z.infer<typeof createSpaceSchema>

export async function createSpace(data: CreateSpaceInput) {
  // ...
}
```

**成功基準**:
- 型定義が統一されている
- Prisma生成型が適切に活用されている
- Zodスキーマからの型推論が適切に使用されている

**検証方法**:
- 型定義の実装をレビュー
- 型定義の統一性を確認
- 型推論が適切に機能していることを確認

#### 2.8.3 バリデーションスキーマの統一

**要件ID**: REQ-TYPE-003

**要件名**: バリデーションスキーマの統一

**詳細仕様**:

1. **バリデーションスキーマの統一**
   - クライアントとサーバーで同じZodスキーマを使用
   - バリデーションエラーの型安全な処理
   - エラーメッセージの国際化対応（将来）

2. **バリデーションスキーマの管理**
   - バリデーションスキーマの一元管理
   - バリデーションスキーマの命名規則の統一
   - バリデーションスキーマのドキュメント化

3. **適用範囲**
   - すべてのフォーム
   - すべてのAPI Routes
   - すべてのServer Actions

**成功基準**:
- クライアントとサーバーで同じZodスキーマが使用されている
- バリデーションエラーが型安全に処理されている
- バリデーションスキーマが統一されている

**検証方法**:
- バリデーションスキーマの実装をレビュー
- バリデーションスキーマの統一性を確認
- バリデーションエラーの処理を確認

### 2.9 テスト戦略の明確化

#### 2.9.1 テストピラミッドの明確化

**要件ID**: REQ-TEST-001

**要件名**: テストピラミッドの明確化

**詳細仕様**:

1. **テストピラミッドの定義**
   - **Unit Tests**: ユーティリティ関数、バリデーションスキーマ
   - **Integration Tests**: Server Actions、API Routes
   - **E2E Tests**: 主要なユーザーフロー

2. **テストカバレッジの目標**
   - Unit Tests: 80%以上
   - Integration Tests: 60%以上
   - E2E Tests: 主要なユーザーフローをカバー

3. **適用範囲**
   - すべてのユーティリティ関数
   - すべてのServer Actions
   - すべてのAPI Routes
   - 主要なユーザーフロー

**成功基準**:
- テストピラミッドが明確に定義されている
- テストカバレッジが目標を達成している
- テストが適切に実行されている

**検証方法**:
- テストカバレッジレポートで確認
- テストの実行結果を確認
- テストの品質をレビュー

#### 2.9.2 E2Eテストの戦略

**要件ID**: REQ-TEST-002

**要件名**: E2Eテストの戦略

**詳細仕様**:

1. **E2Eテストの実装**
   - Playwrightを使用したE2Eテスト
   - 主要なユーザーフローのカバー
   - 管理画面の主要操作のテスト

2. **E2Eテストの対象**
   - 予約フロー
   - お問い合わせフロー
   - 管理画面のCRUD操作
   - 認証フロー

3. **適用範囲**
   - 主要なユーザーフロー
   - 管理画面の主要操作
   - 認証フロー

**成功基準**:
- E2Eテストが適切に実装されている
- 主要なユーザーフローがカバーされている
- E2Eテストが適切に実行されている

**検証方法**:
- E2Eテストの実装をレビュー
- E2Eテストの実行結果を確認
- E2Eテストの品質をレビュー

#### 2.9.3 モック戦略

**要件ID**: REQ-TEST-003

**要件名**: モック戦略の実装

**詳細仕様**:

1. **モック戦略の実装**
   - データベースのモック（Prisma Mock）
   - 外部APIのモック（MSW）
   - 認証のモック

2. **モックの管理**
   - モックデータの一元管理
   - モックデータの更新
   - モックデータのドキュメント化

3. **適用範囲**
   - すべてのテスト
   - データベースアクセス
   - 外部API呼び出し
   - 認証処理

**成功基準**:
- モック戦略が適切に実装されている
- モックデータが適切に管理されている
- モックが適切に機能している

**検証方法**:
- モック戦略の実装をレビュー
- モックの動作を確認
- モックデータの管理を確認

---

## 3. 非機能要件

### 3.1 パフォーマンス要件

#### 3.1.1 ページロード時間

- **First Contentful Paint (FCP)**: < 1.8秒
- **Largest Contentful Paint (LCP)**: < 2.5秒
- **Time to First Byte (TTFB)**: < 800ms
- **First Input Delay (FID)**: < 100ms
- **Cumulative Layout Shift (CLS)**: < 0.1

#### 3.1.2 バンドルサイズ

- **初期バンドルサイズ**: < 200KB (gzipped)
- **各ルートのバンドルサイズ**: < 100KB (gzipped)
- **動的インポートされたライブラリ**: 必要時のみロード

#### 3.1.3 データベースパフォーマンス

- **クエリ実行時間**: < 100ms（95パーセンタイル）
- **N+1問題**: 発生しない
- **接続プーリング**: 適切に設定されている

### 3.2 セキュリティ要件

#### 3.2.1 認証・認可

- **認証**: Auth.js 5を使用
- **セッション管理**: JWTセッション
- **認可**: ロールベースアクセス制御（RBAC）
- **CSRF対策**: Next.js標準機能 + SameSite Cookie

#### 3.2.2 入力検証

- **すべての入力**: Zodスキーマで検証
- **クライアントサイド**: ユーザー体験向上のため検証
- **サーバーサイド**: セキュリティ確保のため必須で検証

#### 3.2.3 セキュリティヘッダー

- **すべてのページ**: セキュリティヘッダーを設定
- **CSP**: 適切に設定されている
- **HSTS**: 適切に設定されている

### 3.3 可用性要件

#### 3.3.1 エラーハンドリング

- **エラーバウンダリ**: 階層的に実装されている
- **エラーログ**: 適切に記録されている
- **エラー通知**: 適切に機能している

#### 3.3.2 モニタリング

- **エラートラッキング**: Sentryまたは類似サービスを統合
- **パフォーマンスモニタリング**: Next.js Analyticsを統合
- **ログ**: 構造化ログを実装

### 3.4 保守性要件

#### 3.4.1 コード品質

- **TypeScript Strict Mode**: 有効化されている
- **型注釈**: すべての関数に明示的な型注釈
- **コードレビュー**: すべての変更をレビュー

#### 3.4.2 ドキュメント

- **コードコメント**: 複雑なロジックにコメントを追加
- **APIドキュメント**: 適切にドキュメント化されている
- **アーキテクチャドキュメント**: 適切にドキュメント化されている

---

## 4. 技術的制約と前提条件

### 4.1 技術的制約

#### 4.1.1 ランタイム

- **Bun 1.3.5**: フルBunランタイムで実行
- **Node.js互換性**: BunはNode.js互換性があるため、Prismaと互換

#### 4.1.2 データベース

- **Prisma 7.2.0**: Edge Runtimeをサポートしていない
- **Next.js API Routes/Server Actions**: `runtime = "nodejs"`を指定（またはデフォルト）

#### 4.1.3 フレームワーク

- **Next.js 16.1.1**: Turbopackがデフォルトのバンドラー
- **React 19.2.3**: Server Components優先アーキテクチャ

### 4.2 前提条件

#### 4.2.1 開発環境

- **Bun 1.3.5**: インストール済み
- **PostgreSQL**: Docker Desktopで実行
- **Supabase**: 開発用プロジェクトが設定済み

#### 4.2.2 本番環境

- **Google Cloud Run**: デプロイ先
- **Supabase**: 本番データベース
- **Cloudflare CDN**: CDNとDDoS保護

---

## 5. 実装優先順位

### フェーズ1: 基盤改善（高優先度）

**期間**: 2-3週間

1. **React 19の`use()`パターンの導入** (REQ-REACT-001)
   - ブログ記事のコメント表示
   - 予約ページの空き状況表示
   - 管理画面の統計情報表示

2. **Suspense境界の最適化** (REQ-SUSPENSE-001, REQ-SUSPENSE-002)
   - データフェッチング単位でのSuspense境界の設定
   - Streaming SSRの最適化

3. **エラーバウンダリの体系化** (REQ-ERROR-001, REQ-ERROR-002)
   - 階層的なエラーバウンダリの実装
   - エラーハンドリングの統一

4. **キャッシング戦略の階層化** (REQ-CACHE-001, REQ-CACHE-002)
   - キャッシュ階層の明確化
   - stale-while-revalidate semanticsの徹底

**成功基準**:
- React 19の`use()`パターンが3箇所以上で実装されている
- Suspense境界が適切に最適化されている
- エラーバウンダリが階層的に実装されている
- キャッシング戦略が階層化されている

### フェーズ2: セキュリティ強化（高優先度）

**期間**: 1-2週間

1. **セキュリティヘッダーの設定** (REQ-SEC-001)
   - `next.config.js`でセキュリティヘッダーを設定
   - CSPの適切な設定

2. **CSRF対策の強化** (REQ-SEC-002)
   - Server ActionsのCSRF保護
   - SameSite Cookieの設定

3. **レート制限の実装** (REQ-SEC-003)
   - API Routesでのレート制限
   - Server Actionsでのレート制限

**成功基準**:
- すべてのセキュリティヘッダーが設定されている
- CSRF対策が適切に実装されている
- レート制限が適切に実装されている

### フェーズ3: パフォーマンス最適化（中優先度）

**期間**: 2-3週間

1. **バンドルサイズの最適化** (REQ-PERF-001)
   - 動的インポートの徹底
   - Tree-shakingの最適化

2. **画像最適化戦略の明確化** (REQ-PERF-002)
   - Next.js Imageコンポーネントの徹底使用
   - WebP形式への自動変換

3. **コード分割戦略の最適化** (REQ-PERF-003)
   - ルートベースのコード分割
   - コンポーネントベースの動的インポート

**成功基準**:
- 初期バンドルサイズが200KB (gzipped)以下である
- すべての画像でNext.js Imageコンポーネントが使用されている
- コード分割が適切に実装されている

### フェーズ4: モニタリングとオブザーバビリティ（中優先度）

**期間**: 1-2週間

1. **エラートラッキングの統合** (REQ-MON-001)
   - Sentryまたは類似サービスの統合
   - エラーコンテキストの収集

2. **パフォーマンスモニタリングの統合** (REQ-MON-002)
   - Next.js Analyticsの統合
   - Web Vitalsの計測

3. **ログ戦略の実装** (REQ-MON-003)
   - 構造化ログの採用
   - ログの集約と分析

**成功基準**:
- エラートラッキングサービスが統合されている
- パフォーマンスモニタリングが統合されている
- 構造化ログが実装されている

### フェーズ5: 型安全性とテスト（低優先度）

**期間**: 2-3週間

1. **TypeScript Strict Modeの徹底** (REQ-TYPE-001)
   - `tsconfig.json`でstrict modeを有効化
   - すべての関数に明示的な型注釈

2. **型定義の統一** (REQ-TYPE-002, REQ-TYPE-003)
   - Prisma生成型の活用
   - Zodスキーマからの型推論

3. **テスト戦略の実装** (REQ-TEST-001, REQ-TEST-002, REQ-TEST-003)
   - テストピラミッドの明確化
   - E2Eテストの実装
   - モック戦略の実装

**成功基準**:
- TypeScript Strict Modeが有効化されている
- 型定義が統一されている
- テストカバレッジが目標を達成している

**合計見積もり**: 8-13週間

---

## 6. 成功基準と検証方法

### 6.1 パフォーマンス基準

#### 6.1.1 Web Vitals

- **FCP**: < 1.8秒
- **LCP**: < 2.5秒
- **CLS**: < 0.1
- **FID**: < 100ms
- **TTFB**: < 800ms

**検証方法**:
- Next.js Analyticsで計測
- Google PageSpeed Insightsで確認
- ブラウザの開発者ツールで確認

#### 6.1.2 バンドルサイズ

- **初期バンドルサイズ**: < 200KB (gzipped)
- **各ルートのバンドルサイズ**: < 100KB (gzipped)

**検証方法**:
- `bun run build`でバンドルサイズを確認
- ブラウザの開発者ツールでバンドルサイズを確認

### 6.2 セキュリティ基準

#### 6.2.1 セキュリティヘッダー

- すべてのセキュリティヘッダーが設定されている
- CSPが適切に設定されている

**検証方法**:
- セキュリティスキャンツールで確認
- ブラウザの開発者ツールでヘッダーを確認

#### 6.2.2 入力検証

- すべての入力がZodスキーマで検証されている
- クライアントサイドとサーバーサイドの両方で検証されている

**検証方法**:
- コードレビューで実装を確認
- ペネトレーションテストで確認

### 6.3 コード品質基準

#### 6.3.1 TypeScript

- TypeScript Strict Modeが有効化されている
- すべての関数に明示的な型注釈がある
- `any`型の使用が0件である

**検証方法**:
- `bun run type-check`で型エラーがないことを確認
- コードレビューで型注釈を確認

#### 6.3.2 テストカバレッジ

- Unit Tests: 80%以上
- Integration Tests: 60%以上
- E2E Tests: 主要なユーザーフローをカバー

**検証方法**:
- テストカバレッジレポートで確認
- テストの実行結果を確認

---

## 7. リスク評価

### 7.1 技術的リスク

| リスク | 影響度 | 発生確率 | 対策 | 状態 |
|--------|--------|----------|------|------|
| React 19の`use()`パターンの実装困難 | 中 | 低 | 公式ドキュメントを参照、段階的に実装 | ⏭️ 実装時対応 |
| Suspense境界の最適化によるパフォーマンス低下 | 中 | 低 | パフォーマンステストを実施、段階的に最適化 | ⏭️ 実装時対応 |
| エラーバウンダリの実装による複雑性の増加 | 低 | 中 | シンプルな実装から開始、段階的に拡張 | ⏭️ 実装時対応 |
| キャッシング戦略の階層化によるバグの発生 | 中 | 中 | 十分なテストを実施、段階的に実装 | ⏭️ 実装時対応 |

### 7.2 セキュリティリスク

| リスク | 影響度 | 発生確率 | 対策 | 状態 |
|--------|--------|----------|------|------|
| セキュリティヘッダーの設定ミス | 高 | 低 | セキュリティスキャンツールで確認 | ⏭️ 実装時対応 |
| CSRF対策の実装ミス | 高 | 低 | Next.js標準機能を活用、テストを実施 | ⏭️ 実装時対応 |
| レート制限の実装ミス | 中 | 低 | 十分なテストを実施、段階的に実装 | ⏭️ 実装時対応 |

### 7.3 パフォーマンスリスク

| リスク | 影響度 | 発生確率 | 対策 | 状態 |
|--------|--------|----------|------|------|
| バンドルサイズの増加 | 中 | 低 | バンドルサイズを監視、動的インポートを徹底 | ⏭️ 実装時対応 |
| 画像最適化の不備 | 中 | 低 | Next.js Imageコンポーネントを徹底使用 | ⏭️ 実装時対応 |
| データベースクエリのパフォーマンス低下 | 高 | 低 | クエリパフォーマンスを監視、インデックスを適切に設定 | ⏭️ 実装時対応 |

---

## 8. 参考資料

### 8.1 プロジェクトドキュメント

- [`CLAUDE.md`](../CLAUDE.md) - プロジェクト全体の仕様書
- [`ARCHITECTURE.md`](../architecture/ARCHITECTURE.md) - 現状のアーキテクチャ
- [`BEST_PRACTICES.md`](../development/BEST_PRACTICES.md) - ベストプラクティス
- [`CACHING_STRATEGY.md`](../development/CACHING_STRATEGY.md) - キャッシング戦略
- [`SECURITY.md`](../security/SECURITY.md) - セキュリティポリシー
- [`FEATURE_REQUIREMENTS.md`](./FEATURE_REQUIREMENTS.md) - 機能要件

### 8.2 外部リソース

- [Next.js 16 Documentation](https://nextjs.org/docs)
- [React 19 Documentation](https://react.dev)
- [Prisma 7 Documentation](https://www.prisma.io/docs)
- [Auth.js 5 Documentation](https://authjs.dev)

---

## 9. 更新履歴

- **2026-01-08**: Next.js 16の非同期paramsパターンに修正（`Promise<{ slug: string }>`形式）、`headers()`を`await`を使用する形式に修正
- **2026-01-06**: 初版作成、詳細な要件定義を追加
