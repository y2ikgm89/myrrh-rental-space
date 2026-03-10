# 071: 統一ContentEditor設計計画

## 概要

Blog/News/PageInlineEditorを統合し、設定駆動型の単一コンポーネント`ContentEditor`を実装する。

## 目標

- コード重複の削減（約40%削減見込み）
- 一貫したUI/UX保証
- 新コンテンツタイプ追加の容易化
- 型安全性の維持

## アーキテクチャ

### ファイル構成

```
src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/
├── ContentEditor.tsx           # 統一エディタコンポーネント（新規）
├── InlineEditorShell.tsx       # 維持
├── EditorHeader.tsx            # 維持
├── UnifiedSidePanel.tsx        # 維持
├── SidePanelShell.tsx          # 維持
├── hooks/
│   ├── index.ts                # 維持
│   ├── useContentEditor.ts     # 新規：統一ロジックフック
│   ├── useEditorPanels.ts      # 維持
│   └── ...
├── content-types/
│   ├── index.ts                # 更新：エクスポート
│   ├── types.ts                # 拡張：統合型定義
│   ├── blog.ts                 # 新規：Blog完全設定
│   ├── news.ts                 # 新規：News完全設定
│   └── page.ts                 # 新規：Page完全設定
└── index.ts                    # 更新：ContentEditorエクスポート
```

### 削除対象

```
src/app/(admin)/admin/(dashboard)/blog/_components/BlogInlineEditor.tsx
src/app/(admin)/admin/(dashboard)/news/_components/NewsInlineEditor.tsx
src/app/(admin)/admin/(dashboard)/pages/_components/PageInlineEditor.tsx
src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/content-types/blog-config.ts
src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/content-types/news-config.ts
src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/content-types/page-config.ts
```

## 型設計

### ContentTypeConfig（統合設定型）

```typescript
type ContentTypeConfig<
  TData, // DBエンティティ型（BlogPostData等）
  TFormData extends FieldValues, // フォームデータ型
  TPreviewData, // プレビューデータ型
> = {
  // === 基本情報 ===
  id: ContentTypeId;
  label: string;
  listPath: string; // '/admin/blog'
  slugPrefix: string; // 'blog/'
  previewBasePath: string; // '/blog'

  // === スキーマ ===
  formSchema: ZodSchema<TFormData>;

  // === 機能フラグ ===
  features: {
    create: boolean;
    delete: boolean;
    publish: boolean;
    comments: boolean;
  };

  // === 公開方式 ===
  publishControl: {
    type: "status" | "isPublished";
    statusEnum?: typeof BlogPostStatus; // status方式の場合
  };

  // === データ変換 ===
  transforms: {
    toFormData: (data?: TData) => TFormData;
    toSubmitPayload: (formData: TFormData) => unknown;
    toPreviewData: (
      formData: TFormData,
      data?: TData,
      extra?: unknown,
    ) => TPreviewData;
  };

  // === Server Actions ===
  actions: {
    create?: (payload: unknown) => Promise<ActionResult<{ id: string }>>;
    update: (id: string, payload: unknown) => Promise<ActionResult>;
    delete?: (id: string) => Promise<ActionResult>;
    publish?: (id: string) => Promise<ActionResult<void, string>>;
    unpublish?: (id: string) => Promise<ActionResult<void, string>>;
  };

  // === サイドパネル ===
  sidePanelConfig: {
    title: string;
    width: "default" | "narrow";
    tabs: TabDefinition[];
  };
};
```

### ContentEditorProps

```typescript
type ContentEditorProps<
  TData,
  TFormData extends FieldValues,
  TPreviewData,
  TConfig extends ContentTypeConfig<TData, TFormData, TPreviewData>,
> = {
  config: TConfig;
  data?: TData;
  mode?: "create" | "edit";
  // コンテンツタイプ固有の追加データ
  extraData?: {
    categories?: CategoryOption[];
    tags?: TagOption[];
    onCreateCategory?: (name: string) => Promise<CategoryOption | null>;
    onCreateTag?: (name: string) => Promise<TagOption | null>;
  };
};
```

## 実装詳細

### Phase 1: 型定義とフック

1. `content-types/types.ts` - 統合型定義
2. `hooks/useContentEditor.ts` - 統一ロジックフック

### Phase 2: 設定ファイル

1. `content-types/blog.ts` - Blog完全設定
2. `content-types/news.ts` - News完全設定
3. `content-types/page.ts` - Page完全設定

### Phase 3: 統一コンポーネント

1. `ContentEditor.tsx` - 統一エディタ

### Phase 4: 移行と削除

1. 各ページのインポート更新
2. 旧コンポーネント削除

## useContentEditorフック設計

```typescript
function useContentEditor<TData, TFormData extends FieldValues, TPreviewData>({
  config,
  data,
  mode,
  extraData,
}: UseContentEditorOptions<TData, TFormData, TPreviewData>) {
  // フォーム管理
  const form = useForm<TFormData>({
    resolver: zodResolver(config.formSchema),
    defaultValues: config.transforms.toFormData(data),
  })

  // パネル管理
  const panels = useEditorPanels()

  // プレビュー
  const preview = usePreview(config.id)

  // 状態
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [hasEditorChanges, setHasEditorChanges] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

  // ハンドラー
  const handleSave = useCallback(() => { ... }, [])
  const handlePublish = useCallback(() => { ... }, [])
  const handleUnpublish = useCallback(() => { ... }, [])
  const handleDelete = useCallback(() => { ... }, [])
  const handlePreview = useCallback(() => { ... }, [])
  const handleBack = useCallback(() => { ... }, [])
  const handleContentChange = useCallback(() => { ... }, [])

  return {
    // フォーム
    form,
    isPending,
    isDirty: form.formState.isDirty || hasEditorChanges,

    // パネル
    ...panels,

    // 値
    title: form.watch('title'),
    content: form.watch('content'),
    publishStatus: ...,

    // ハンドラー
    handleSave,
    handlePublish,
    handleUnpublish,
    handleDelete,
    handlePreview,
    handleBack,
    handleContentChange,

    // 削除ダイアログ
    isDeleteDialogOpen,
    setIsDeleteDialogOpen,
  }
}
```

## ContentEditorコンポーネント設計

```typescript
export function ContentEditor<TData, TFormData extends FieldValues, TPreviewData>({
  config,
  data,
  mode = 'edit',
  extraData,
}: ContentEditorProps<TData, TFormData, TPreviewData>) {
  const editor = useContentEditor({ config, data, mode, extraData })

  return (
    <InlineEditorShell
      onSubmit={editor.form.handleSubmit(editor.onSubmit)}
      onSave={editor.handleSave}
      isDirty={editor.isDirty}
      isPanelOpen={editor.isPanelOpen}
      header={
        <EditorHeader
          title={editor.title}
          slug={`${config.slugPrefix}${editor.slug}`}
          isDirty={editor.isDirty}
          isPending={editor.isPending}
          isSidePanelOpen={editor.isSettingsPanelOpen}
          onToggleSidePanel={editor.toggleSettings}
          onSave={editor.handleSave}
          onPreview={editor.handlePreview}
          onBack={editor.handleBack}
          publishActions={editor.publishActions}
          showCommentButton={config.features.comments && mode === 'edit'}
          isCommentPanelOpen={editor.isCommentsPanelOpen}
          onToggleCommentPanel={editor.toggleComments}
          extraActions={
            config.features.delete && mode === 'edit' && data
              ? <DeleteDialog ... />
              : undefined
          }
        />
      }
      panel={
        <>
          <UnifiedSidePanel
            isOpen={editor.isSettingsPanelOpen}
            onClose={editor.closePanel}
            config={config.sidePanelConfig}
            register={editor.form.register}
            control={editor.form.control}
            errors={editor.form.formState.errors}
            setValue={editor.form.setValue}
            getValues={editor.form.getValues}
            disabled={editor.isPending}
            extraProps={editor.sidePanelExtraProps}
          />
          {config.features.comments && mode === 'edit' && data && (
            <CommentPanel
              isOpen={editor.isCommentsPanelOpen}
              contentType={config.id}
              contentId={data.id}
              activeMarkId={editor.activeMarkId}
              onClose={editor.closePanel}
              pendingComment={editor.pendingComment}
              onPendingCommentSubmit={editor.clearPendingComment}
            />
          )}
        </>
      }
    >
      <LexicalEditor
        content={editor.content}
        onChange={editor.handleContentChange}
        disabled={editor.isPending}
        className={EDITOR_PROSE_CLASSES}
        showToolbar
        height="100%"
        onMarkClick={mode === 'edit' && data ? editor.selectMark : undefined}
        onAddComment={mode === 'edit' && data ? editor.handleAddComment : undefined}
      />
    </InlineEditorShell>
  )
}
```

## 使用例

### Blog

```typescript
// blog/[id]/page.tsx
import { ContentEditor, blogConfig } from '@/admin/components/editor/inline'

export default async function BlogEditPage({ params }: Props) {
  const post = await getBlogPostById(params.id)
  const categories = await getBlogCategories()
  const tags = await getBlogTags()

  return (
    <ContentEditor
      config={blogConfig}
      data={post}
      mode="edit"
      extraData={{
        categories,
        tags,
        onCreateCategory: createBlogCategory,
        onCreateTag: createBlogTag,
      }}
    />
  )
}
```

### News

```typescript
// news/new/page.tsx
import { ContentEditor, newsConfig } from '@/admin/components/editor/inline'

export default function NewsNewPage() {
  return (
    <ContentEditor
      config={newsConfig}
      mode="create"
    />
  )
}
```

### Page

```typescript
// pages/[slug]/edit/page.tsx
import { ContentEditor, pageConfig } from '@/admin/components/editor/inline'

export default async function PageEditPage({ params }: Props) {
  const page = await getPageBySlug(params.slug)

  return (
    <ContentEditor
      config={pageConfig}
      data={page}
    />
  )
}
```

## タスク一覧

1. [ ] `content-types/types.ts` - 統合型定義の拡張
2. [ ] `hooks/useContentEditor.ts` - 統一ロジックフック作成
3. [ ] `content-types/blog.ts` - Blog設定作成
4. [ ] `content-types/news.ts` - News設定作成
5. [ ] `content-types/page.ts` - Page設定作成
6. [ ] `ContentEditor.tsx` - 統一エディタ作成
7. [ ] Blog関連ページの移行
8. [ ] News関連ページの移行
9. [ ] Page関連ページの移行
10. [ ] 旧コンポーネント削除
11. [ ] インデックス更新
12. [ ] 型チェック・ビルド検証

## 検証項目

- [ ] `bun run type-check` 成功
- [ ] `bun run lint` 成功
- [ ] `bun run build` 成功
- [ ] Blog新規作成・編集・削除・公開/非公開
- [ ] News新規作成・編集・削除・公開/非公開
- [ ] Page編集
- [ ] プレビュー機能
- [ ] コメント機能
- [ ] 離脱警告

## リスク

- 大規模変更による既存機能への影響
- 型の複雑化による保守性低下

## 緩和策

- 段階的移行（Blog→News→Page）
- 各移行後にテスト実施
- 型推論を最大限活用し、明示的な型パラメータを最小化
