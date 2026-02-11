# Post.tags Complete Usage Map

## File Locations
- **Actions**: `src/app/(admin)/admin/(dashboard)/_shared/actions/post.ts`
- **Validators**: `src/shared/lib/json-validators.ts`
- **Validations**: `src/app/(admin)/admin/(dashboard)/_shared/lib/validations/post.ts`

---

## 1. Type Definitions

### PostData Type (src/app/(admin)/admin/(dashboard)/_shared/lib/validations/post.ts)

```typescript
/**
 * 投稿記事データ型
 */
export type PostData = {
  id: string
  title: string
  slug: string
  excerpt: string
  content: string
  thumbnailUrl: string
  ogpImageUrl: string | null
  categoryId: string
  tags: string[]  // ← tags is string[]
  metaDescription: string | null
  metaKeywords: string | null
  ogpTitle: string | null
  ogpDescription: string | null
  publishedAt: Date | null
  status: PostStatus
  viewCount: number
  createdAt: Date
  updatedAt: Date
  contentWidth: LayoutWidth | null
  contentWidthCustom: number | null
  category: {
    id: string
    name: string
    slug: string
  }
  author: {
    id: string
    name: string | null
    email: string
  }
}
```

### Zod Schema (Create/Update)

```typescript
/**
 * 投稿記事作成スキーマ
 */
export const createPostSchema = z
  .object({
    title: z.string().min(1, { error: 'タイトルは必須です' }).max(200, { error: 'タイトルは200文字以内' }),
    slug: z.string().min(1, { error: 'スラッグは必須です' }).max(200).regex(/^[a-z0-9-]+$/, { error: 'スラッグは小文字英数字とハイフンのみ' }),
    excerpt: z.string().min(1, { error: '抜粋は必須です' }).max(500, { error: '抜粋は500文字以内' }),
    content: z.string().default(''),
    thumbnailUrl: z.string().min(1, { error: 'サムネイルURLは必須です' }),
    categoryId: z.string().uuid({ error: 'カテゴリを選択してください' }),
    tags: z.array(z.string()).default([]),  // ← tags validation
  })
  .merge(seoOgpFieldsSchema)

export type CreatePostInput = z.infer<typeof createPostSchema>

/**
 * 投稿記事更新スキーマ
 */
export const updatePostSchema = z
  .object({
    title: z.string().min(1, { error: 'タイトルは必須です' }).max(200, { error: 'タイトルは200文字以内' }),
    slug: z.string().min(1, { error: 'スラッグは必須です' }).max(200).regex(/^[a-z0-9-]+$/, { error: 'スラッグは小文字英数字とハイフンのみ' }),
    excerpt: z.string().min(1, { error: '抜粋は必須です' }).max(500, { error: '抜粋は500文字以内' }),
    content: z.string().min(1, { error: '本文は必須です' }),
    thumbnailUrl: z.string().min(1, { error: 'サムネイルURLは必須です' }),
    categoryId: z.string().uuid({ error: 'カテゴリを選択してください' }),
    tags: z.array(z.string()).default([]),  // ← tags validation
    contentWidth: z.nativeEnum(LayoutWidth).nullable().optional(),
    contentWidthCustom: z.number().int().min(320).max(1920).nullable().optional(),
  })
  .merge(seoOgpFieldsSchema)

export type UpdatePostInput = z.infer<typeof updatePostSchema>
```

---

## 2. parseStringArray Helper

### Definition (src/shared/lib/json-validators.ts)

```typescript
const stringArraySchema = z.array(z.string())

/**
 * unknown値をstring[]に安全に変換
 *
 * Prisma.JsonValueやunknown型のデータを安全に変換
 * バリデーション失敗時は空配列を返す
 *
 * @example
 * const imageUrls = parseStringArray(space.imageUrls)
 * const facilities = parseStringArray(space.facilities)
 * const tags = parseStringArray(post.tags)
 */
export function parseStringArray(value: unknown): string[] {
  const result = stringArraySchema.safeParse(value)
  return result.success ? result.data : []
}
```

---

## 3. Server Actions - Tag Handling

### getPosts

```typescript
/**
 * 投稿記事一覧を取得
 */
export async function getPosts(
  filters: PostFilters = {},
  pagination: PostPagination = {}
): Promise<GetPostsResult> {
  const hasPermission = await checkReadPermission()
  if (!hasPermission) {
    return { posts: [], total: 0, page: 1, limit: 10, totalPages: 0 }
  }

  const { status, categoryId, search } = filters
  const {
    page = 1,
    limit = 10,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = pagination

  // Where条件を構築
  const where: PostWhereInput = {}

  if (status === 'PUBLISHED') {
    where.status = PostStatus.PUBLISHED
  } else if (status === 'DRAFT') {
    where.status = PostStatus.DRAFT
  } else if (status === 'ARCHIVED') {
    where.status = PostStatus.ARCHIVED
  }

  if (categoryId) {
    where.categoryId = categoryId
  }

  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { excerpt: { contains: search, mode: 'insensitive' } },
      { content: { contains: search, mode: 'insensitive' } },
    ]
  }

  // 総件数と記事一覧を並列取得（N+1解消）
  const [total, posts] = await prisma.$transaction([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: {
        [sortBy]: sortOrder,
      },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ])

  // tags の型変換 ← parseStringArray使用
  const formattedPosts: PostData[] = posts.map((post) => ({
    ...post,
    tags: parseStringArray(post.tags),
  }))

  return {
    posts: formattedPosts,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  }
}
```

### getPostById

```typescript
/**
 * 投稿記事詳細を取得
 */
export async function getPostById(id: string): Promise<PostData | null> {
  const hasPermission = await checkReadPermission()
  if (!hasPermission) {
    return null
  }

  const post = await prisma.post.findUnique({
    where: { id },
    include: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      author: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  })

  if (!post) return null

  return {
    ...post,
    tags: parseStringArray(post.tags),  // ← parseStringArray使用
  }
}
```

### createPost

```typescript
/**
 * 投稿記事を作成
 */
export const createPost = withPermission<[CreatePostInput], { id: string }>(
  'post',
  'create'
)(async (user, data) => {
  const parsed = createPostSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  // スラッグの使用可能チェック（予約パス＋全コンテンツタイプ横断）
  const slugCheck = await checkSlugAvailability(parsed.data.slug, {
    currentType: 'post',
  })
  if (!slugCheck.available) {
    return createFailure(getSlugErrorMessage(slugCheck.reason))
  }

  const post = await prisma.post.create({
    data: {
      ...parsed.data,  // ← tags included from parsed.data
      status: PostStatus.DRAFT,
      authorId: user.id,
    },
  })

  updateTag(CACHE_TAGS.POSTS)

  // Cloudflare CDN キャッシュパージ
  fireAndForget(purgePostCache(post.slug), { 
    operation: 'purgePostCache', 
    category: ErrorCategory.EXTERNAL_API, 
    severity: ErrorSeverity.LOW 
  })

  return createSuccess('投稿記事を作成しました', { id: post.id })
})
```

### updatePost

```typescript
/**
 * 投稿記事を更新
 */
export const updatePost = withPermission<[string, UpdatePostInput], void>(
  'post',
  'update'
)(async (user, id, data) => {
  const parsed = updatePostSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  const existingPost = await prisma.post.findUnique({
    where: { id },
    select: { id: true, slug: true },
  })

  if (!existingPost) {
    return createFailure('投稿記事が見つかりません')
  }

  // スラッグの使用可能チェック（予約パス＋全コンテンツタイプ横断、自分自身は除外）
  const slugCheck = await checkSlugAvailability(parsed.data.slug, {
    currentType: 'post',
    currentId: id,
  })
  if (!slugCheck.available) {
    return createFailure(getSlugErrorMessage(slugCheck.reason))
  }

  const { contentWidth, contentWidthCustom, ...rest } = parsed.data

  // 旧 slug でのキャッシュ無効化のため、更新前の slug を保持
  const oldSlug = existingPost.slug

  await prisma.post.update({
    where: { id },
    data: {
      ...rest,  // ← tags included
      contentWidth: contentWidth ?? null,
      contentWidthCustom: contentWidthCustom ?? null,
    },
  })

  updateTag(CACHE_TAGS.POSTS)
  // slug 変更時は両方を無効化
  updateTag(getCacheTag.posts.detail(oldSlug))
  if (parsed.data.slug !== oldSlug) {
    updateTag(getCacheTag.posts.detail(parsed.data.slug))
  }

  // Cloudflare CDN キャッシュパージ
  fireAndForget(purgePostCache(oldSlug), { 
    operation: 'purgePostCache', 
    category: ErrorCategory.EXTERNAL_API, 
    severity: ErrorSeverity.LOW 
  })
  if (parsed.data.slug !== oldSlug) {
    fireAndForget(purgePostCache(parsed.data.slug), { 
      operation: 'purgePostCache', 
      category: ErrorCategory.EXTERNAL_API, 
      severity: ErrorSeverity.LOW 
    })
  }

  return createSuccess('投稿記事を保存しました')
})
```

---

## 4. Post Tag Management Actions

### getPostTags

```typescript
/**
 * タグ一覧を取得
 * N+1問題を回避: 全記事のタグを一度に取得してメモリ上で集計
 */
export async function getPostTags(): Promise<PostTagData[]> {
  const hasPermission = await checkReadPermission()
  if (!hasPermission) {
    return []
  }

  // タグと記事を並列取得（2クエリのみ）
  const [tags, posts] = await Promise.all([
    prisma.postTag.findMany({
      orderBy: { name: 'asc' },
    }),
    prisma.post.findMany({
      select: { tags: true },
    }),
  ])

  // メモリ上でタグごとの使用回数を集計
  const tagCountMap = new Map<string, number>()
  for (const post of posts) {
    const postTags = parseStringArray(post.tags)  // ← parseStringArray使用
    for (const tagName of postTags) {
      tagCountMap.set(tagName, (tagCountMap.get(tagName) || 0) + 1)
    }
  }

  return tags.map((tag) => ({
    ...tag,
    _count: { posts: tagCountMap.get(tag.name) || 0 },
  }))
}
```

### getPostTagById

```typescript
/**
 * タグ詳細を取得
 */
export async function getPostTagById(id: string): Promise<PostTagData | null> {
  const hasPermission = await checkReadPermission()
  if (!hasPermission) {
    return null
  }

  const tag = await prisma.postTag.findUnique({
    where: { id },
  })

  if (!tag) return null

  const count = await prisma.post.count({
    where: {
      tags: { array_contains: [tag.name] },
    },
  })

  return {
    ...tag,
    _count: { posts: count },
  }
}
```

### createPostTag

```typescript
/**
 * タグを作成
 */
export const createPostTag = withPermission<[PostTagInput], { id: string }>(
  'post',
  'create'
)(async (user, data) => {
  const parsed = postTagSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  // 名前の重複チェック
  const existingName = await prisma.postTag.findUnique({
    where: { name: parsed.data.name },
  })
  if (existingName) {
    return createFailure('このタグ名は既に使用されています')
  }

  // スラッグの重複チェック
  const existingSlug = await prisma.postTag.findUnique({
    where: { slug: parsed.data.slug },
  })
  if (existingSlug) {
    return createFailure('このスラッグは既に使用されています')
  }

  const tag = await prisma.postTag.create({
    data: parsed.data,
  })

  updateTag(CACHE_TAGS.POST_TAGS)

  return createSuccess('タグを作成しました', { id: tag.id })
})
```

### updatePostTag

```typescript
/**
 * タグを更新
 * タグ名が変更される場合、関連する全記事のtags配列も更新
 */
export const updatePostTag = withPermission<[string, PostTagInput], void>(
  'post',
  'update'
)(async (user, id, data) => {
  const parsed = postTagSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  // 既存タグと重複チェックを並列実行
  const [existingTag, duplicates] = await Promise.all([
    prisma.postTag.findUnique({
      where: { id },
      select: { id: true, name: true },
    }),
    // 名前またはスラッグの重複を一度に検索
    prisma.postTag.findFirst({
      where: {
        id: { not: id },
        OR: [
          { name: parsed.data.name },
          { slug: parsed.data.slug },
        ],
      },
      select: { name: true, slug: true },
    }),
  ])

  if (!existingTag) {
    return createFailure('タグが見つかりません')
  }

  // 重複エラーの詳細メッセージ
  if (duplicates) {
    if (duplicates.name === parsed.data.name) {
      return createFailure('このタグ名は既に使用されています')
    }
    return createFailure('このスラッグは既に使用されています')
  }

  // タグ名が変更された場合、関連する記事のtagsも更新
  if (existingTag.name !== parsed.data.name) {
    // インタラクティブトランザクションで一括更新
    await prisma.$transaction(async (tx) => {
      // タグを更新
      await tx.postTag.update({
        where: { id },
        data: parsed.data,
      })

      // 影響を受ける記事を取得
      const postsWithTag = await tx.post.findMany({
        where: {
          tags: { array_contains: [existingTag.name] },
        },
        select: { id: true, tags: true },
      })

      // 記事のタグを一括更新（Promise.allで並列実行）
      if (postsWithTag.length > 0) {
        await Promise.all(
          postsWithTag.map((post) => {
            const tags = parseStringArray(post.tags)  // ← parseStringArray使用
            const updatedTags = tags.map((t) =>
              t === existingTag.name ? parsed.data.name : t
            )
            return tx.post.update({
              where: { id: post.id },
              data: { tags: updatedTags },  // ← tags배열 업데이트
            })
          })
        )
      }
    })
  } else {
    await prisma.postTag.update({
      where: { id },
      data: parsed.data,
    })
  }

  // タグと関련 记事のキャッシュを無効化
  updateTag(CACHE_TAGS.POSTS)
  updateTag(CACHE_TAGS.POST_TAGS)

  // Cloudflare CDN キャッシュパージ（タグ一覧に影響）
  fireAndForget(purgePostCache(), { 
    operation: 'purgePostCache', 
    category: ErrorCategory.EXTERNAL_API, 
    severity: ErrorSeverity.LOW 
  })

  return createSuccess('タグを更新しました')
})
```

### deletePostTag

```typescript
/**
 * タグを削除
 */
export const deletePostTag = withPermission<[string], void>(
  'post',
  'delete'
)(async (user, id) => {
  const tag = await prisma.postTag.findUnique({
    where: { id },
    select: { id: true, name: true },
  })

  if (!tag) {
    return createFailure('タグが見つかりません')
  }

  // タグを使用している記事が存在するかチェック（findFirstで効率化）
  const postUsingTag = await prisma.post.findFirst({
    where: {
      tags: { array_contains: [tag.name] },
    },
    select: { id: true },
  })

  if (postUsingTag) {
    return createFailure('このタグは記事で使用されているため削除できません')
  }

  await prisma.postTag.delete({
    where: { id },
  })

  updateTag(CACHE_TAGS.POST_TAGS)

  return createSuccess('タグを削除しました')
})
```

---

## Summary: parseStringArray Usage Locations

| Function | Usage Location | Purpose |
|----------|----------------|---------|
| `getPosts()` | Line 96-105 | Convert Prisma JSON tags to string[] |
| `getPostById()` | Line 129 | Convert single post tags to string[] |
| `getPostTags()` | Line 598-605 | Count tag usage across all posts |
| `updatePostTag()` | Line 739 | Update tags in affected posts |

**Key Pattern**: All tag data flows through `parseStringArray()` when:
1. Reading from DB (Prisma returns JSON)
2. Processing tag arrays in transactions
3. Returning PostData to client

**Important**: `createPost` and `updatePost` accept tags as `z.array(z.string())` from validated input and pass directly to Prisma—no conversion needed for write operations.
