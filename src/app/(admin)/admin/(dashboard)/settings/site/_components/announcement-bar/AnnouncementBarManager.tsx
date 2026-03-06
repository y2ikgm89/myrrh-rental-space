'use client'

import { useState, useTransition } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { format } from 'date-fns'
import { toast } from 'sonner'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/admin/components/ui'
import {
  getAnnouncementBars,
  createAnnouncementBar,
  updateAnnouncementBar,
  deleteAnnouncementBar,
  toggleAnnouncementBarActive,
} from '@/admin/actions/announcement-bar'
import type { AnnouncementBarData, AnnouncementBarInput } from '@/admin/actions/announcement-bar'
import {
  updateAnnouncementBarCarouselSettings,
  type AnnouncementBarCarouselSettingsInput,
} from '@/admin/actions/settings'
import {
  validateAnimation,
  validateDesignStyle,
} from '@/shared/lib/announcement-bar-utils'
import { AnnouncementBarAnimation, AnnouncementBarDesignStyle, AnnouncementBarType } from '@/shared/generated/prisma/enums'
import { isValidAnnouncementBarType } from '@/shared/lib/validations/enums'
import { BarList } from './BarList'
import { BarDialog, DeleteDialog } from './BarDialog'
import { CarouselSettingsPanel } from './CarouselSettings'
import { isValidHexColor, type BarFormData, type CarouselSettings } from './types'

// =============================================================================
// Form Schema
// =============================================================================

const barFormSchema = z.object({
  message: z.string().min(1, { error: 'メッセージは必須です' }).max(200, { error: 'メッセージは200文字以内' }),
  type: z.enum(AnnouncementBarType),
  linkUrl: z.string().url({ error: '有効なURLを入力してください' }).or(z.literal('')),
  linkText: z.string().max(50, { error: 'リンクテキストは50文字以内' }),
  isActive: z.boolean(),
  priority: z.number().int().min(0).max(100),
  startAt: z.string(),
  endAt: z.string(),
}) satisfies z.ZodType<BarFormData>

// =============================================================================
// Props
// =============================================================================

type AnnouncementBarManagerProps = {
  initialBars: AnnouncementBarData[]
  initialCarouselSettings: AnnouncementBarCarouselSettingsInput
}

// =============================================================================
// Main Component
// =============================================================================

export function AnnouncementBarManager({
  initialBars,
  initialCarouselSettings,
}: AnnouncementBarManagerProps) {
  const [isPending, startTransition] = useTransition()
  const [bars, setBars] = useState<AnnouncementBarData[]>(initialBars)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingBar, setEditingBar] = useState<AnnouncementBarData | null>(null)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // カルーセル設定のステート
  const [carouselSettings, setCarouselSettings] = useState<CarouselSettings>(() => ({
    announcementBarAnimation: validateAnimation(initialCarouselSettings.announcementBarAnimation ?? AnnouncementBarAnimation.fade),
    announcementBarDuration: initialCarouselSettings.announcementBarDuration,
    announcementBarAutoPlay: initialCarouselSettings.announcementBarAutoPlay,
    announcementBarPauseOnHover: initialCarouselSettings.announcementBarPauseOnHover,
    announcementBarShowArrows: initialCarouselSettings.announcementBarShowArrows,
    announcementBarShowIndicator: initialCarouselSettings.announcementBarShowIndicator,
    announcementBarDesignStyle: validateDesignStyle(initialCarouselSettings.announcementBarDesignStyle ?? AnnouncementBarDesignStyle.solid),
    announcementBarBgColor: initialCarouselSettings.announcementBarBgColor || '',
    announcementBarTextColor: initialCarouselSettings.announcementBarTextColor || '',
    announcementBarStripeColor: initialCarouselSettings.announcementBarStripeColor || '',
    announcementBarStripeAnimation: initialCarouselSettings.announcementBarStripeAnimation,
    announcementBarGradientAnimation: initialCarouselSettings.announcementBarGradientAnimation,
    announcementBarGlassAnimation: initialCarouselSettings.announcementBarGlassAnimation,
    announcementBarSticky: initialCarouselSettings.announcementBarSticky ?? false,
  }))

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    control,
    formState: { errors },
  } = useForm<BarFormData>({
    resolver: zodResolver(barFormSchema),
    defaultValues: {
      message: '',
      type: AnnouncementBarType.info,
      linkUrl: '',
      linkText: '',
      isActive: true,
      priority: 0,
      startAt: '',
      endAt: '',
    },
  })

  const loadBars = async () => {
    const result = await getAnnouncementBars()
    setBars(result.items)
  }

  // Open dialog for create/edit
  const openDialog = (bar?: AnnouncementBarData) => {
    if (bar) {
      setEditingBar(bar)
      reset({
        message: bar.message,
        type: isValidAnnouncementBarType(bar.type) ? bar.type : AnnouncementBarType.info,
        linkUrl: bar.linkUrl || '',
        linkText: bar.linkText || '',
        isActive: bar.isActive,
        priority: bar.priority,
        startAt: bar.startAt ? format(new Date(bar.startAt), "yyyy-MM-dd'T'HH:mm") : '',
        endAt: bar.endAt ? format(new Date(bar.endAt), "yyyy-MM-dd'T'HH:mm") : '',
      })
    } else {
      setEditingBar(null)
      reset({
        message: '',
        type: AnnouncementBarType.info,
        linkUrl: '',
        linkText: '',
        isActive: true,
        priority: 0,
        startAt: '',
        endAt: '',
      })
    }
    setIsDialogOpen(true)
  }

  // Submit form
  const onSubmit = (data: BarFormData) => {
    startTransition(async () => {
      const input: AnnouncementBarInput = {
        message: data.message,
        type: data.type,
        linkUrl: data.linkUrl || null,
        linkText: data.linkText || null,
        bgColor: null,
        textColor: null,
        isActive: data.isActive,
        priority: data.priority,
        startAt: data.startAt || null,
        endAt: data.endAt || null,
      }

      if (editingBar) {
        const result = await updateAnnouncementBar(editingBar.id, input)
        if (result.success) {
          toast.success('お知らせバーを更新しました')
          setIsDialogOpen(false)
          loadBars()
        } else {
          toast.error(result.error)
        }
      } else {
        const result = await createAnnouncementBar(input)
        if (result.success) {
          toast.success('お知らせバーを作成しました')
          setIsDialogOpen(false)
          loadBars()
        } else {
          toast.error(result.error)
        }
      }
    })
  }

  // Toggle active
  const handleToggleActive = (id: string) => {
    startTransition(async () => {
      const result = await toggleAnnouncementBarActive(id)
      if (result.success) {
        loadBars()
      } else {
        toast.error(result.error)
      }
    })
  }

  // Delete
  const handleDelete = () => {
    if (!deletingId) return

    startTransition(async () => {
      const result = await deleteAnnouncementBar(deletingId)
      if (result.success) {
        toast.success('お知らせバーを削除しました')
        setDeleteDialogOpen(false)
        setDeletingId(null)
        loadBars()
      } else {
        toast.error(result.error)
      }
    })
  }

  // Save carousel settings
  const handleSaveCarouselSettings = () => {
    const colorFields = [
      { name: '背景色', value: carouselSettings.announcementBarBgColor },
      { name: '文字色', value: carouselSettings.announcementBarTextColor },
      { name: 'ストライプ色', value: carouselSettings.announcementBarStripeColor },
    ]
    for (const field of colorFields) {
      if (field.value && !isValidHexColor(field.value)) {
        toast.error(`${field.name}は#RRGGBB形式で入力してください（例: #2563eb）`)
        return
      }
    }

    startTransition(async () => {
      const result = await updateAnnouncementBarCarouselSettings({
        announcementBarAnimation: carouselSettings.announcementBarAnimation,
        announcementBarDuration: carouselSettings.announcementBarDuration,
        announcementBarAutoPlay: carouselSettings.announcementBarAutoPlay,
        announcementBarPauseOnHover: carouselSettings.announcementBarPauseOnHover,
        announcementBarShowArrows: carouselSettings.announcementBarShowArrows,
        announcementBarShowIndicator: carouselSettings.announcementBarShowIndicator,
        announcementBarDesignStyle: carouselSettings.announcementBarDesignStyle,
        announcementBarBgColor: carouselSettings.announcementBarBgColor || null,
        announcementBarTextColor: carouselSettings.announcementBarTextColor || null,
        announcementBarStripeColor: carouselSettings.announcementBarStripeColor || null,
        announcementBarStripeAnimation: carouselSettings.announcementBarStripeAnimation,
        announcementBarGradientAnimation: carouselSettings.announcementBarGradientAnimation,
        announcementBarGlassAnimation: carouselSettings.announcementBarGlassAnimation,
        announcementBarSticky: carouselSettings.announcementBarSticky,
      })
      if (result.success) {
        toast.success('デザイン・カルーセル設定を保存しました')
      } else {
        toast.error(result.error)
      }
    })
  }

  return (
    <div className="space-y-6">
      <Tabs defaultValue="bars" className="space-y-4">
        <TabsList>
          <TabsTrigger value="bars">お知らせ一覧</TabsTrigger>
          <TabsTrigger value="design">デザイン・カルーセル設定</TabsTrigger>
        </TabsList>

        <TabsContent value="bars">
          <BarList
            bars={bars}
            isPending={isPending}
            onEdit={openDialog}
            onCreate={() => openDialog()}
            onToggleActive={handleToggleActive}
            onDelete={(id) => {
              setDeletingId(id)
              setDeleteDialogOpen(true)
            }}
          />
        </TabsContent>

        <TabsContent value="design">
          <CarouselSettingsPanel
            settings={carouselSettings}
            isPending={isPending}
            onSettingsChange={setCarouselSettings}
            onSave={handleSaveCarouselSettings}
          />
        </TabsContent>
      </Tabs>

      <BarDialog
        isOpen={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        editingBar={editingBar}
        isPending={isPending}
        register={register}
        setValue={setValue}
        control={control}
        errors={errors}
        onSubmit={handleSubmit(onSubmit)}
      />

      <DeleteDialog
        isOpen={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        isPending={isPending}
        onConfirm={handleDelete}
      />
    </div>
  )
}
