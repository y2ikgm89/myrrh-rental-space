'use client'

/**
 * FAQ項目インラインエディター
 *
 * Lexicalリッチテキストエディターを使用したFAQ項目編集UI
 * 新規作成・編集の両方に対応
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useConfirm } from '@/admin/contexts/confirm-context'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import dynamic from 'next/dynamic'
import {
  EditorHeader,
  InlineEditorShell,
} from '@/admin/components/editor/inline'
import { SidePanelShell } from '@/admin/components/editor/inline/SidePanelShell'
import { SEOFields, OGPFields } from '@/admin/components/editor/inline/side-panel'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/admin/components/ui'

const LexicalEditor = dynamic(
  () => import('@/admin/components/editor/lexical').then((mod) => ({ default: mod.LexicalEditor })),
  {
    ssr: false,
    loading: () => (
      <div className="h-[500px] flex items-center justify-center bg-muted/50">
        <div className="animate-pulse text-muted-foreground">エディタを読み込み中...</div>
      </div>
    ),
  }
)
import {
  createFaqItem,
  updateFaqItem,
  deleteFaqItem,
  toggleFaqItemPublished,
} from '@/admin/actions/faq'
import type { FaqItemWithCategory } from '@/admin/lib/validations/faq'
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Label,
} from '@/admin/components/ui'
import { EDITOR_PROSE_CLASSES } from '@/shared/lib/styles/prose'
import { logger } from '@/shared/lib/logger'
import type { FaqEditorFormData } from '@/admin/components/editor/inline/types'

// =============================================================================
// Schema
// =============================================================================

const formSchema = z.object({
  question: z.string().min(1, { error: '質問は必須です' }).max(500, { error: '質問は500文字以内で入力してください' }),
  answerJson: z.string().min(1, { error: '回答は必須です' }),
  categoryId: z.string().uuid({ error: 'カテゴリを選択してください' }),
  order: z.number().int().min(0),
  isPublished: z.boolean(),
  metaDescription: z.string().optional(),
  metaKeywords: z.string().optional(),
  ogpTitle: z.string().optional(),
  ogpDescription: z.string().optional(),
  ogpImageUrl: z.string().optional(),
})

type FormData = z.infer<typeof formSchema> & FaqEditorFormData

// =============================================================================
// Types
// =============================================================================

type Category = {
  id: string
  name: string
}

type FaqItemInlineEditorProps = {
  item?: FaqItemWithCategory
  categories: Category[]
  mode?: 'create' | 'edit'
  defaultCategoryId?: string
}

// =============================================================================
// Component
// =============================================================================

export function FaqItemInlineEditor({
  item,
  categories,
  mode = 'edit',
  defaultCategoryId,
}: FaqItemInlineEditorProps) {
  const router = useRouter()
  const confirm = useConfirm()
  const [isPending, startTransition] = useTransition()
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [hasEditorChanges, setHasEditorChanges] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: item
      ? {
          question: item.question,
          answerJson: item.answerJson ? JSON.stringify(item.answerJson) : '',
          categoryId: item.categoryId,
          order: item.order,
          isPublished: item.isPublished,
          metaDescription: item.metaDescription ?? '',
          metaKeywords: item.metaKeywords ?? '',
          ogpTitle: item.ogpTitle ?? '',
          ogpDescription: item.ogpDescription ?? '',
          ogpImageUrl: item.ogpImageUrl ?? '',
        }
      : {
          question: '',
          answerJson: '',
          categoryId: defaultCategoryId || '',
          order: 0,
          isPublished: true,
          metaDescription: '',
          metaKeywords: '',
          ogpTitle: '',
          ogpDescription: '',
          ogpImageUrl: '',
        },
  })

  const question = useWatch({ control, name: 'question' })
  const isPublished = useWatch({ control, name: 'isPublished' })
  const answerJson = useWatch({ control, name: 'answerJson' })

  const handleJsonChange = (json: string) => {
    setValue('answerJson', json, { shouldDirty: true })
    setHasEditorChanges(true)
  }

  const onSubmit = (data: FormData) => {
    startTransition(async () => {
      try {
        const payload = {
          question: data.question,
          answerJson: data.answerJson,
          categoryId: data.categoryId,
          order: data.order,
          isPublished: data.isPublished,
          metaDescription: data.metaDescription || null,
          metaKeywords: data.metaKeywords || null,
          ogpTitle: data.ogpTitle || null,
          ogpDescription: data.ogpDescription || null,
          ogpImageUrl: data.ogpImageUrl || null,
        }

        if (mode === 'create') {
          const result = await createFaqItem(payload)
          if (result.success) {
            toast.success('FAQ項目を作成しました')
            router.push(`/admin/faq/items/${result.data.id}`)
          } else {
            toast.error(result.error)
          }
        } else if (item) {
          const result = await updateFaqItem(item.id, payload)
          if (result.success) {
            reset(data)
            setHasEditorChanges(false)
            router.refresh()
            toast.success('FAQ項目を保存しました')
          } else {
            toast.error(result.error)
          }
        }
      } catch (error) {
        logger.error('保存中にエラーが発生しました', { error: error instanceof Error ? error.message : String(error) })
        toast.error('保存中にエラーが発生しました')
      }
    })
  }

  const handleSave = () => {
    if (isPending) return
    handleSubmit(onSubmit)()
  }

  const handlePublish = () => {
    if (!item || isPending) return
    startTransition(async () => {
      const result = await toggleFaqItemPublished(item.id)
      if (result.success) {
        toast.success(result.message)
        setValue('isPublished', true)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  const handleUnpublish = () => {
    if (!item || isPending) return
    startTransition(async () => {
      const result = await toggleFaqItemPublished(item.id)
      if (result.success) {
        toast.success(result.message)
        setValue('isPublished', false)
        router.refresh()
      } else {
        toast.error(result.error)
      }
    })
  }

  const handlePreview = () => {
    if (mode === 'create') {
      toast.info('FAQ項目を作成後にプレビューできます')
      return
    }
    const isUnsaved = isDirty || hasEditorChanges
    if (isUnsaved) {
      toast.info('プレビューには保存済みのコンテンツが表示されます')
    }
    window.open(`/faq`, '_blank')
  }

  const handleBack = async () => {
    const isUnsaved = isDirty || hasEditorChanges
    if (isUnsaved) {
      const confirmed = await confirm({
        title: '変更を破棄しますか？',
        description: '保存されていない変更があります。破棄してもよろしいですか？',
        confirmLabel: '破棄',
        variant: 'destructive',
      })
      if (!confirmed) return
    }
    router.push('/admin/faq')
  }

  const handleToggleSidePanel = () => {
    setIsSidePanelOpen((prev) => !prev)
  }

  const handleCloseSidePanel = () => {
    setIsSidePanelOpen(false)
  }

  const handleDelete = () => {
    if (!item) return
    startTransition(async () => {
      try {
        const result = await deleteFaqItem(item.id)
        if (result.success) {
          toast.success('FAQ項目を削除しました')
          router.push('/admin/faq')
        } else {
          toast.error(result.error)
        }
      } catch (error) {
        logger.error('削除中にエラーが発生しました', { error: error instanceof Error ? error.message : String(error) })
        toast.error('削除中にエラーが発生しました')
      }
    })
  }

  const isFormDirty = isDirty || hasEditorChanges

  const categoryOptions = categories.map((cat) => ({
    id: cat.id,
    name: cat.name,
  }))

  return (
    <InlineEditorShell
      onSubmit={handleSubmit(onSubmit)}
      onSave={handleSave}
      isDirty={isFormDirty}
      isPanelOpen={isSidePanelOpen}
      header={
        <EditorHeader
          title={question || '新規FAQ'}
          slug={item ? `faq/items/${item.id}` : 'faq/items/new'}
          isDirty={isFormDirty}
          isPending={isPending}
          isSidePanelOpen={isSidePanelOpen}
          onToggleSidePanel={handleToggleSidePanel}
          onSave={handleSave}
          onPreview={handlePreview}
          onBack={handleBack}
          publishActions={
            mode === 'edit' && item
              ? {
                  status: isPublished,
                  onPublish: handlePublish,
                  onUnpublish: handleUnpublish,
                }
              : undefined
          }
          extraActions={
            mode === 'edit' && item ? (
              <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <DialogTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive"
                    disabled={isPending}
                  >
                    削除
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>FAQ項目を削除しますか？</DialogTitle>
                    <DialogDescription>
                      この操作は取り消せません。本当に削除してもよろしいですか？
                    </DialogDescription>
                  </DialogHeader>
                  <DialogFooter>
                    <Button
                      variant="outline"
                      onClick={() => setIsDeleteDialogOpen(false)}
                      disabled={isPending}
                    >
                      キャンセル
                    </Button>
                    <Button
                      variant="destructive"
                      onClick={handleDelete}
                      disabled={isPending}
                    >
                      {isPending ? '削除中...' : '削除'}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            ) : undefined
          }
        />
      }
      panel={
        <SidePanelShell
          isOpen={isSidePanelOpen}
          onClose={handleCloseSidePanel}
          title="FAQ設定"
        >
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="basic">基本</TabsTrigger>
              <TabsTrigger value="seo">SEO</TabsTrigger>
            </TabsList>
            <TabsContent value="basic" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">カテゴリ</CardTitle>
                </CardHeader>
                <CardContent>
                  <select
                    {...register('categoryId')}
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    disabled={isPending}
                  >
                    {categoryOptions.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="seo" className="mt-4 space-y-4">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">SEO設定</CardTitle>
                </CardHeader>
                <CardContent>
                  <SEOFields
                    register={register}
                    errors={errors}
                    disabled={isPending}
                    fields={{
                      metaDescription: 'metaDescription',
                      metaKeywords: 'metaKeywords',
                    }}
                  />
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm">OGP設定</CardTitle>
                </CardHeader>
                <CardContent>
                  <OGPFields
                    register={register}
                    control={control}
                    errors={errors}
                    setValue={setValue}
                    disabled={isPending}
                    fields={{
                      ogpTitle: 'ogpTitle',
                      ogpDescription: 'ogpDescription',
                      ogpImageUrl: 'ogpImageUrl',
                    }}
                  />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </SidePanelShell>
      }
    >
      {/* Question Input */}
      <div className="border-b bg-background px-4 py-3">
        <Label htmlFor="question" className="text-sm font-medium text-muted-foreground">
          質問
        </Label>
        <Input
          id="question"
          {...register('question')}
          placeholder="例: 予約はいつまでキャンセルできますか？"
          className="mt-1 text-lg font-medium border-none shadow-none focus-visible:ring-0 px-0"
          disabled={isPending}
        />
        {errors.question && (
          <p className="text-sm text-destructive mt-1">{errors.question.message}</p>
        )}
      </div>

      {/* Lexical Editor for Answer */}
      <div className="flex-1 overflow-auto">
        <Label className="text-sm font-medium text-muted-foreground mb-2 block px-8 pt-2">
          回答
        </Label>
        <LexicalEditor
          contentJson={answerJson || undefined}
          contentHtml={item?.answerHtml ?? ''}
          onChange={handleJsonChange}
          disabled={isPending}
          className={EDITOR_PROSE_CLASSES}
          showToolbar
          height="calc(100vh - 300px)"
        />
      </div>
    </InlineEditorShell>
  )
}
