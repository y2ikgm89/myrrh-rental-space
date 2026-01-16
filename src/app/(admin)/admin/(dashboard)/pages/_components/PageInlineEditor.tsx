'use client'

/**
 * ページインラインエディター
 *
 * Webflow型のフルページ編集UI
 * 公開ページと同じ見た目でコンテンツを編集
 */

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import { toast } from 'sonner'
import {
  InlineEditorLayout,
  EditorHeader,
  EditorCanvas,
  SidePanel,
  useKeyboardShortcuts,
  useBeforeUnload,
} from '@/components/admin/editor/inline'
import { updatePage } from '@/actions/admin/page'
import type { PageData } from '@/lib/validations/page'

/**
 * フォーム用スキーマ（Lexicalエディター用）
 */
const formSchema = z.object({
  title: z.string().min(1, 'タイトルは必須です').max(200, 'タイトルは200文字以内です'),
  description: z.string().max(500, '説明は500文字以内です').optional(),
  content: z.string().min(1, 'コンテンツは必須です').max(500000, 'コンテンツは500,000文字以内です'),
  metaDescription: z.string().max(160, 'メタディスクリプションは160文字以内です').optional(),
  metaKeywords: z.string().max(200, 'メタキーワードは200文字以内です').optional(),
  ogpTitle: z.string().max(100, 'OGPタイトルは100文字以内です').optional(),
  ogpDescription: z.string().max(200, 'OGP説明は200文字以内です').optional(),
  ogpImageUrl: z.string().url('有効なURLを入力してください').optional().or(z.literal('')),
  isPublished: z.boolean(),
  publishedAt: z.string().optional(),
  contentWidth: z.string().optional(),
  contentWidthCustom: z.string().optional(),
})

type FormData = z.infer<typeof formSchema>

type PageInlineEditorProps = {
  page: PageData
}

export function PageInlineEditor({ page }: PageInlineEditorProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [isSidePanelOpen, setIsSidePanelOpen] = useState(false)

  const {
    register,
    handleSubmit,
    control,
    setValue,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: page.title,
      description: page.description ?? '',
      content: page.content,
      metaDescription: page.metaDescription ?? '',
      metaKeywords: page.metaKeywords ?? '',
      ogpTitle: page.ogpTitle ?? '',
      ogpDescription: page.ogpDescription ?? '',
      ogpImageUrl: page.ogpImageUrl ?? '',
      isPublished: page.isPublished,
      publishedAt: page.publishedAt
        ? format(new Date(page.publishedAt), "yyyy-MM-dd'T'HH:mm")
        : '',
      contentWidth: page.contentWidth ?? '',
      contentWidthCustom: page.contentWidthCustom?.toString() ?? '',
    },
  })

  const title = useWatch({ control, name: 'title' })
  const content = useWatch({ control, name: 'content' })

  const onSubmit = (data: FormData) => {
    startTransition(async () => {
      try {
        const result = await updatePage(page.slug, {
          title: data.title,
          description: data.description,
          content: data.content,
          metaDescription: data.metaDescription,
          metaKeywords: data.metaKeywords,
          ogpTitle: data.ogpTitle,
          ogpDescription: data.ogpDescription,
          ogpImageUrl: data.ogpImageUrl,
          isPublished: data.isPublished,
          publishedAt: data.publishedAt ? new Date(data.publishedAt) : undefined,
          contentWidth: (data.contentWidth || undefined) as 'XS' | 'SM' | 'MD' | 'LG' | 'CUSTOM' | undefined,
          contentWidthCustom: data.contentWidthCustom ? parseInt(data.contentWidthCustom, 10) : undefined,
        })

        if (result.success) {
          // dirty状態をリセット
          reset(data)
          router.refresh()
          toast.success('ページを保存しました')
        } else {
          toast.error(result.error)
        }
      } catch (error) {
        console.error('保存中にエラーが発生しました:', error)
        toast.error('保存中にエラーが発生しました')
      }
    })
  }

  const handleSave = () => {
    if (isPending) return
    handleSubmit(onSubmit)()
  }

  const handlePreview = () => {
    if (isDirty) {
      toast.info('プレビューには保存済みのコンテンツが表示されます')
    }
    window.open(`/${page.slug}`, '_blank')
  }

  const handleBack = () => {
    if (isDirty && !window.confirm('保存されていない変更があります。破棄してもよろしいですか？')) {
      return
    }
    router.push('/admin/pages')
  }

  const handleToggleSidePanel = () => {
    setIsSidePanelOpen((prev) => !prev)
  }

  const handleCloseSidePanel = () => {
    setIsSidePanelOpen(false)
  }

  const handleContentChange = (html: string) => {
    setValue('content', html, { shouldDirty: true })
  }

  const handleTitleChange = (newTitle: string) => {
    setValue('title', newTitle, { shouldDirty: true })
  }

  // キーボードショートカット
  useKeyboardShortcuts({ onSave: handleSave })

  // 離脱警告
  useBeforeUnload({ isDirty })

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="h-screen">
      <InlineEditorLayout>
        <div className="flex flex-1 flex-col overflow-hidden">
          <EditorHeader
            title={title}
            slug={page.slug}
            isDirty={isDirty}
            isPending={isPending}
            isSidePanelOpen={isSidePanelOpen}
            onToggleSidePanel={handleToggleSidePanel}
            onSave={handleSave}
            onPreview={handlePreview}
            onBack={handleBack}
          />

          <EditorCanvas
            title={title}
            onTitleChange={handleTitleChange}
            showTitle={true}
            content={content}
            onChange={handleContentChange}
            disabled={isPending}
          />
        </div>

        <SidePanel
          isOpen={isSidePanelOpen}
          onClose={handleCloseSidePanel}
          register={register}
          control={control}
          errors={errors}
          setValue={setValue}
          disabled={isPending}
        />
      </InlineEditorLayout>
    </form>
  )
}
