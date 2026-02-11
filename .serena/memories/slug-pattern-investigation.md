# Slug パターン調査結果

## 調査対象: `src/app/(admin)/` 配下
調査日: 2026-02-08

---

## 1. `pageSlug` を使用している箇所

### 発見数: 3ファイル

#### ① CommentTable.tsx - postSlug（テーブルセル内）
- **ファイル**: `src/app/(admin)/admin/(dashboard)/posts/comments/_components/CommentTable.tsx`
- **行番号**: 222
- **パターン**: **Props drilling ではなく、データプロパティ**
- **詳細**: 
  ```typescript
  type AdminCommentData = {
    postSlug: string // テーブル行に含まれるデータプロパティ
  }
  // Link内で使用
  <Link href={`/posts/${comment.postSlug}`}>
  ```
- **修正不要**: `postSlug` はサーバーアクション (`post-comment.ts`) の戻り値に含まれるデータプロパティ。Props drilling ではなく、取得したデータの一部。

#### ② space.ts - spaceSlugSchema 定義
- **ファイル**: `src/app/(admin)/admin/(dashboard)/_shared/lib/validations/space.ts`
- **行番号**: 42
- **パターン**: **Zod スキーマ（バリデーション）**
- **詳細**: 
  ```typescript
  export const spaceSlugSchema = z
    .string()
    .min(1, { error: 'スラッグを入力してください' })
    // ...
  ```
- **修正不要**: Zod スキーマは常に必要。バリデーション用。

#### ③ post-comment.ts - postSlug データ抽出
- **ファイル**: `src/app/(admin)/admin/(dashboard)/_shared/actions/post-comment.ts`
- **行番号**: 37, 95
- **パターン**: **Server Action の型定義およびデータ変換**
- **詳細**: 
  ```typescript
  export type AdminCommentData = {
    postSlug: string // 型定義
  }
  
  function toAdminCommentData(comment) {
    return {
      postSlug: comment.post.slug, // DB から取得
    }
  }
  ```
- **修正不要**: Server Action 内で必要なデータを抽出。適切な設計。

---

## 2. `useParams` の使用状況

### 発見数: 0

**結論**: `useParams()` は `src/app/(admin)/` 配下で **使用されていない**。

---

## 3. slug を props drilling で渡している型/interface

### 発見数: 1ファイル

#### TitleSlugFields.tsx - slugPreviewPath
- **ファイル**: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/side-panel/TitleSlugFields.tsx`
- **行番号**: 15, 24, 39, 61, 100
- **パターン**: **Props passing（リテラル値、props drilling ではない）**
- **詳細**:
  ```typescript
  type TitleSlugFieldsProps<T extends FieldValues> = FieldComponentProps<T> & {
    slugPreviewPath?: string // URL プレビューパス（例: "/spaces"）
  }
  
  const currentSlug = getValues && fields.slug ? getValues(fields.slug) : ''
  ```
- **修正不要**: 
  - `slugPreviewPath` は **固定値（リテラル）** として親から渡される（"spaces", "posts" 等）
  - これはコンポーネントの設定値であり、props drilling ではない
  - フォームの汎用性を保つため適切な設計

---

## 4. 動的ルートページの slug 取得パターン

### Next.js 16 実装パターン

#### ✅ pages/[slug]/edit/page.tsx（システムページ編集）
- **ファイル**: `src/app/(admin)/admin/(dashboard)/pages/[slug]/edit/page.tsx`
- **パターン**: **`Promise<{ slug: string }>` で型安全な params 取得**
- **行番号**: 22, 30, 40
- **コード**:
  ```typescript
  type PageParams = Promise<{ slug: string }>
  
  export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
    const { slug } = await params
    const page = await getPageWithSections(slug)
    // ...
  }
  
  export default async function EditPagePage({ params }: PageProps) {
    const { slug } = await params
    // ...
  }
  ```
- **推奨度**: ✅ **最新のNext.js 16パターン**

#### ✅ spaces/[id]/page.tsx（スペース詳細）
- **ファイル**: `src/app/(admin)/admin/(dashboard)/spaces/[id]/page.tsx`
- **パターン**: **`Promise<{ id: string }>` で型安全**
- **行番号**: 11, 19, 35
- **推奨度**: ✅ **最新パターン**

#### ✅ posts/[id]/page.tsx（投稿編集）
- **ファイル**: `src/app/(admin)/admin/(dashboard)/posts/[id]/page.tsx`
- **パターン**: **`Promise<{ id: string }>` で型安全**
- **行番号**: 9, 17, 33
- **推奨度**: ✅ **最新パターン**

---

## 5. クライアントコンポーネントへの Props Drilling 検査

### Page → PageEditTabs → PageSectionsManager → PageSectionList

#### ✅ PageEditTabs.tsx
- **受け取る**: `page: PageForEdit` (Server Component から)
- **内部状態**: `activeTab` (nuqs で管理)
- **渡すもの**: `pageId: page.id` (PageSectionsManager へ)
- **評価**: ✅ **OK** - `pageId` のみを渡す（最小限）

#### ✅ PageSectionList.tsx
- **受け取る**: `pageId: string`
- **用途**: `getPageSections(pageId)` で useEffect 内データ取得
- **評価**: ✅ **最適設計** - Server Action で必要なパラメータのみ

#### ✅ PageSeoForm.tsx
- **受け取る**: `page: PageSeoData` (Server Component から)
- **使用**: `page.slug` で Server Action 呼び出し
- **評価**: ✅ **OK** - slug は Server Component から直接受け取り

---

## 6. まとめ & 改善推奨事項

### 現状分析
| 項目 | 状態 | コメント |
|------|------|---------|
| `useParams` 使用 | ❌ なし | 動的ルートは全て `Promise<Params>` パターン |
| Props drilling (slug) | ❌ なし | 各コンポーネントで適切に値を渡している |
| `spaceSlug` 等 | ✅ あり | バリデーションスキーマとして適切 |
| Server Action 内データ抽出 | ✅ あり | postSlug は DB から必要に応じて取得 |
| 動的ルート型安全 | ✅ あり | 全て `Promise<T>` パターン (Next.js 16) |

### 改善推奨: **不要**

**理由**:
1. 全動的ルートページが最新の `Promise<Params>` パターンを使用
2. Props drilling は行われていない（必要なデータのみ渡されている）
3. `useParams` は Client Components では使用されるケースがない（Server Components で params 取得）
4. Zod スキーマとして `spaceSlugSchema` は必要かつ適切

---

## 結論

**props drilling は存在しません。現在の実装は Next.js 16 のベストプラクティスに従っています。**

追加の refactoring は不要。
