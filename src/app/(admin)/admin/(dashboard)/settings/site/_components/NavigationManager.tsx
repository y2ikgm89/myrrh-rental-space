'use client'

import { useState, useTransition } from 'react'
import { useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Badge,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
  CSS,
  type DragEndEvent,
} from '@/admin/components/ui'
import { DragHandle } from '@/admin/components/ui/sortable'
import {
  getNavigationItems,
  createNavigationItem,
  updateNavigationItem,
  deleteNavigationItem,
  updateNavigationOrder,
  getSocialLinks,
  createSocialLink,
  updateSocialLink,
  deleteSocialLink,
  updateSocialLinkOrder,
} from '@/admin/actions/navigation'
import type {
  NavigationItemData,
  NavigationItemInput,
  SocialLinkData,
  SocialLinkInput,
} from '@/admin/actions/navigation'
import type { NavigationType, SocialPlatform } from '@/shared/generated/prisma/enums'
import { isValidSocialPlatform } from '@/shared/lib/validations/enums'
import { cn } from '@/shared/lib/utils'

// =============================================================================
// Navigation Form Schema
// =============================================================================

type NavFormData = {
  type: NavigationType
  parentId: string | null
  label: string
  url: string
  isExternal: boolean
  order: number
  isActive: boolean
}

const navFormSchema = z.object({
  type: z.enum(['HEADER_DESKTOP', 'HEADER_MOBILE', 'FOOTER']),
  parentId: z.string().nullable(),
  label: z.string().min(1, 'ラベルは必須です').max(50),
  url: z.string().min(1, 'URLは必須です'),
  isExternal: z.boolean(),
  order: z.number().int().min(0),
  isActive: z.boolean(),
}) satisfies z.ZodType<NavFormData>

// =============================================================================
// Social Link Form Schema
// =============================================================================

type SocialFormData = {
  platform: SocialPlatform
  url: string
  iconUrl: string | null
  order: number
  isActive: boolean
  showOnDesktop: boolean
  showOnMobile: boolean
}

const socialFormSchema = z.object({
  platform: z.enum(['TWITTER', 'FACEBOOK', 'INSTAGRAM', 'YOUTUBE', 'LINE', 'TIKTOK', 'OTHER']),
  url: z.string().min(1, 'URLは必須です').url('有効なURLを入力してください'),
  iconUrl: z.string().nullable(),
  order: z.number().int().min(0),
  isActive: z.boolean(),
  showOnDesktop: z.boolean(),
  showOnMobile: z.boolean(),
}) satisfies z.ZodType<SocialFormData>

// =============================================================================
// Platform Labels
// =============================================================================

const platformLabels: Record<SocialPlatform, string> = {
  TWITTER: 'X (Twitter)',
  FACEBOOK: 'Facebook',
  INSTAGRAM: 'Instagram',
  YOUTUBE: 'YouTube',
  LINE: 'LINE',
  TIKTOK: 'TikTok',
  OTHER: 'その他',
}

// =============================================================================
// Sortable Navigation Row
// =============================================================================

type SortableNavRowProps = {
  item: NavigationItemData
  onEdit: (item: NavigationItemData) => void
  onDelete: (id: string) => void
  isPending: boolean
  isChild?: boolean
}

function SortableNavRow({ item, onEdit, onDelete, isPending, isChild }: SortableNavRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn(
        isDragging && 'z-50 bg-muted/80 shadow-lg',
        isChild && 'bg-muted/30'
      )}
    >
      <TableCell className="w-12">
        <div {...attributes} {...listeners}>
          <DragHandle />
        </div>
      </TableCell>
      <TableCell className={cn('font-medium', isChild && 'pl-8')}>
        {isChild && <span className="mr-2 text-muted-foreground">└</span>}
        {item.label}
      </TableCell>
      <TableCell className="text-muted-foreground">{item.url}</TableCell>
      <TableCell>
        {item.isExternal && <Badge variant="outline">外部</Badge>}
      </TableCell>
      <TableCell>
        <Badge variant={item.isActive ? 'default' : 'secondary'}>
          {item.isActive ? '有効' : '無効'}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(item)}
            disabled={isPending}
          >
            編集
          </Button>
          <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={isPending}>
                削除
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>メニューを削除しますか？</DialogTitle>
                <DialogDescription>
                  この操作は取り消せません。
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDeleteDialogOpen(false)}
                  disabled={isPending}
                >
                  キャンセル
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    onDelete(item.id)
                    setDeleteDialogOpen(false)
                  }}
                  disabled={isPending}
                >
                  削除する
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </TableCell>
    </TableRow>
  )
}

// =============================================================================
// Sortable Social Row
// =============================================================================

type SortableSocialRowProps = {
  link: SocialLinkData
  onEdit: (link: SocialLinkData) => void
  onDelete: (id: string) => void
  isPending: boolean
}

function SortableSocialRow({ link, onEdit, onDelete, isPending }: SortableSocialRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: link.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn(isDragging && 'z-50 bg-muted/80 shadow-lg')}
    >
      <TableCell className="w-12">
        <div {...attributes} {...listeners}>
          <DragHandle />
        </div>
      </TableCell>
      <TableCell className="font-medium">
        {platformLabels[link.platform]}
      </TableCell>
      <TableCell className="text-muted-foreground truncate max-w-xs">
        {link.url}
      </TableCell>
      <TableCell>
        <Badge variant={link.showOnDesktop ? 'default' : 'secondary'}>
          {link.showOnDesktop ? '表示' : '非表示'}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant={link.showOnMobile ? 'default' : 'secondary'}>
          {link.showOnMobile ? '表示' : '非表示'}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant={link.isActive ? 'default' : 'secondary'}>
          {link.isActive ? '有効' : '無効'}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(link)}
            disabled={isPending}
          >
            編集
          </Button>
          <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={isPending}>
                削除
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>SNSリンクを削除しますか？</DialogTitle>
                <DialogDescription>
                  この操作は取り消せません。
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDeleteDialogOpen(false)}
                  disabled={isPending}
                >
                  キャンセル
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    onDelete(link.id)
                    setDeleteDialogOpen(false)
                  }}
                  disabled={isPending}
                >
                  削除する
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </TableCell>
    </TableRow>
  )
}

// =============================================================================
// Flatten items for D&D (parent + children in order)
// =============================================================================

function flattenNavItems(items: NavigationItemData[]): (NavigationItemData & { isChild: boolean })[] {
  const result: (NavigationItemData & { isChild: boolean })[] = []
  for (const item of items) {
    result.push({ ...item, isChild: false })
    for (const child of item.children) {
      result.push({ ...child, isChild: true })
    }
  }
  return result
}

// =============================================================================
// Props
// =============================================================================

type NavigationManagerProps = {
  initialDesktopItems: NavigationItemData[]
  initialMobileItems: NavigationItemData[]
  initialFooterItems: NavigationItemData[]
  initialSocialLinks: SocialLinkData[]
}

// =============================================================================
// Component
// =============================================================================

export function NavigationManager({
  initialDesktopItems,
  initialMobileItems,
  initialFooterItems,
  initialSocialLinks,
}: NavigationManagerProps) {
  const [isPending, startTransition] = useTransition()

  // Navigation Items State
  const [desktopItems, setDesktopItems] = useState<NavigationItemData[]>(initialDesktopItems)
  const [mobileItems, setMobileItems] = useState<NavigationItemData[]>(initialMobileItems)
  const [footerItems, setFooterItems] = useState<NavigationItemData[]>(initialFooterItems)
  const [isNavDialogOpen, setIsNavDialogOpen] = useState(false)
  const [editingNavItem, setEditingNavItem] = useState<NavigationItemData | null>(null)

  // Social Links State
  const [socialLinks, setSocialLinks] = useState<SocialLinkData[]>(initialSocialLinks)
  const [isSocialDialogOpen, setIsSocialDialogOpen] = useState(false)
  const [editingSocialLink, setEditingSocialLink] = useState<SocialLinkData | null>(null)

  // D&D Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Navigation Form
  const navForm = useForm<NavFormData>({
    resolver: zodResolver(navFormSchema),
    defaultValues: {
      type: 'HEADER_DESKTOP',
      parentId: null,
      label: '',
      url: '',
      isExternal: false,
      order: 0,
      isActive: true,
    },
  })

  // Social Form
  const socialForm = useForm<SocialFormData>({
    resolver: zodResolver(socialFormSchema),
    defaultValues: {
      platform: 'TWITTER',
      url: '',
      iconUrl: null,
      order: 0,
      isActive: true,
      showOnDesktop: true,
      showOnMobile: true,
    },
  })

  // Navigation form watched values
  const navIsExternal = useWatch({ control: navForm.control, name: 'isExternal' })
  const navIsActive = useWatch({ control: navForm.control, name: 'isActive' })
  const navType = useWatch({ control: navForm.control, name: 'type' })
  const navParentId = useWatch({ control: navForm.control, name: 'parentId' })

  // Social form watched values
  const socialPlatform = useWatch({ control: socialForm.control, name: 'platform' })
  const socialIsActive = useWatch({ control: socialForm.control, name: 'isActive' })
  const socialShowOnDesktop = useWatch({ control: socialForm.control, name: 'showOnDesktop' })
  const socialShowOnMobile = useWatch({ control: socialForm.control, name: 'showOnMobile' })

  const loadData = async () => {
    const [desktop, mobile, footer, social] = await Promise.all([
      getNavigationItems('HEADER_DESKTOP'),
      getNavigationItems('HEADER_MOBILE'),
      getNavigationItems('FOOTER'),
      getSocialLinks(),
    ])
    setDesktopItems(desktop)
    setMobileItems(mobile)
    setFooterItems(footer)
    setSocialLinks(social)
  }

  // Navigation Item Handlers
  const getItemsByType = (type: NavigationType): NavigationItemData[] => {
    switch (type) {
      case 'HEADER_DESKTOP':
        return desktopItems
      case 'HEADER_MOBILE':
        return mobileItems
      case 'FOOTER':
        return footerItems
      default:
        return []
    }
  }

  const getParentOptions = (type: NavigationType): NavigationItemData[] => {
    return getItemsByType(type).filter(item => !item.parentId)
  }

  const openNavCreateDialog = (type: NavigationType) => {
    setEditingNavItem(null)
    const items = getItemsByType(type)
    const flatItems = flattenNavItems(items)
    navForm.reset({
      type,
      parentId: null,
      label: '',
      url: '',
      isExternal: false,
      order: flatItems.length,
      isActive: true,
    })
    setIsNavDialogOpen(true)
  }

  const openNavEditDialog = (item: NavigationItemData) => {
    setEditingNavItem(item)
    navForm.reset({
      type: item.type,
      parentId: item.parentId,
      label: item.label,
      url: item.url,
      isExternal: item.isExternal,
      order: item.order,
      isActive: item.isActive,
    })
    setIsNavDialogOpen(true)
  }

  const onNavSubmit = (data: NavFormData) => {
    startTransition(async () => {
      const payload: NavigationItemInput = {
        ...data,
        parentId: data.parentId || null,
      }

      if (editingNavItem) {
        const result = await updateNavigationItem(editingNavItem.id, payload)
        if (result.success) {
          setIsNavDialogOpen(false)
          loadData()
        } else {
          toast.error(result.error)
        }
      } else {
        const result = await createNavigationItem(payload)
        if (result.success) {
          setIsNavDialogOpen(false)
          loadData()
        } else {
          toast.error(result.error)
        }
      }
    })
  }

  const handleNavDelete = (id: string) => {
    startTransition(async () => {
      const result = await deleteNavigationItem(id)
      if (result.success) {
        loadData()
      } else {
        toast.error(result.error)
      }
    })
  }

  // Navigation D&D Handler
  const handleNavDragEnd = (type: NavigationType) => (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const items = getItemsByType(type)
    const flatItems = flattenNavItems(items)

    const oldIndex = flatItems.findIndex((item) => item.id === active.id)
    const newIndex = flatItems.findIndex((item) => item.id === over.id)

    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(flatItems, oldIndex, newIndex)

    const updates = reordered.map((item, index) => ({
      id: item.id,
      order: index,
    }))

    startTransition(async () => {
      const result = await updateNavigationOrder(updates)
      if (result.success) {
        loadData()
      } else {
        toast.error(result.error)
      }
    })
  }

  // Social Link Handlers
  const openSocialCreateDialog = () => {
    setEditingSocialLink(null)
    socialForm.reset({
      platform: 'TWITTER',
      url: '',
      iconUrl: null,
      order: socialLinks.length,
      isActive: true,
      showOnDesktop: true,
      showOnMobile: true,
    })
    setIsSocialDialogOpen(true)
  }

  const openSocialEditDialog = (link: SocialLinkData) => {
    setEditingSocialLink(link)
    socialForm.reset({
      platform: link.platform,
      url: link.url,
      iconUrl: link.iconUrl,
      order: link.order,
      isActive: link.isActive,
      showOnDesktop: link.showOnDesktop,
      showOnMobile: link.showOnMobile,
    })
    setIsSocialDialogOpen(true)
  }

  const onSocialSubmit = (data: SocialFormData) => {
    startTransition(async () => {
      const payload: SocialLinkInput = data

      if (editingSocialLink) {
        const result = await updateSocialLink(editingSocialLink.id, payload)
        if (result.success) {
          setIsSocialDialogOpen(false)
          loadData()
        } else {
          toast.error(result.error)
        }
      } else {
        const result = await createSocialLink(payload)
        if (result.success) {
          setIsSocialDialogOpen(false)
          loadData()
        } else {
          toast.error(result.error)
        }
      }
    })
  }

  const handleSocialDelete = (id: string) => {
    startTransition(async () => {
      const result = await deleteSocialLink(id)
      if (result.success) {
        loadData()
      } else {
        toast.error(result.error)
      }
    })
  }

  // Social D&D Handler
  const handleSocialDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = socialLinks.findIndex((link) => link.id === active.id)
    const newIndex = socialLinks.findIndex((link) => link.id === over.id)

    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(socialLinks, oldIndex, newIndex)
    setSocialLinks(reordered)

    const updates = reordered.map((link, index) => ({
      id: link.id,
      order: index,
    }))

    startTransition(async () => {
      const result = await updateSocialLinkOrder(updates)
      if (!result.success) {
        toast.error(result.error)
        loadData()
      }
    })
  }

  // Render navigation table with D&D
  const renderNavTable = (items: NavigationItemData[], type: NavigationType, emptyMessage: string) => {
    const flatItems = flattenNavItems(items)

    return (
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>
            {type === 'HEADER_DESKTOP' && 'デスクトップメニュー'}
            {type === 'HEADER_MOBILE' && 'モバイルメニュー'}
            {type === 'FOOTER' && 'フッターメニュー'}
          </CardTitle>
          <Button size="sm" onClick={() => openNavCreateDialog(type)}>
            追加
          </Button>
        </CardHeader>
        <CardContent>
          {flatItems.length === 0 ? (
            <p className="py-4 text-center text-muted-foreground">{emptyMessage}</p>
          ) : (
            <>
              <p className="mb-4 text-sm text-muted-foreground">
                ドラッグ&ドロップで順序を変更できます
              </p>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleNavDragEnd(type)}
              >
                <SortableContext
                  items={flatItems.map((item) => item.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12"></TableHead>
                        <TableHead>ラベル</TableHead>
                        <TableHead>URL</TableHead>
                        <TableHead className="w-24">外部</TableHead>
                        <TableHead className="w-24">有効</TableHead>
                        <TableHead className="w-32">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {flatItems.map((item) => (
                        <SortableNavRow
                          key={item.id}
                          item={item}
                          onEdit={openNavEditDialog}
                          onDelete={handleNavDelete}
                          isPending={isPending}
                          isChild={item.isChild}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </SortableContext>
              </DndContext>
            </>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <div className="space-y-6">
      {/* タブナビゲーション */}
      <Tabs defaultValue="desktop">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="desktop">デスクトップ</TabsTrigger>
          <TabsTrigger value="mobile">モバイル</TabsTrigger>
          <TabsTrigger value="footer">フッター</TabsTrigger>
          <TabsTrigger value="social">SNSリンク</TabsTrigger>
        </TabsList>

        {/* デスクトップメニュー */}
        <TabsContent value="desktop" className="mt-6">
          {renderNavTable(desktopItems, 'HEADER_DESKTOP', 'デスクトップメニューがありません')}
        </TabsContent>

        {/* モバイルメニュー */}
        <TabsContent value="mobile" className="mt-6">
          {renderNavTable(mobileItems, 'HEADER_MOBILE', 'モバイルメニューがありません')}
          <p className="mt-4 text-sm text-muted-foreground">
            モバイルでは項目数を少なめに設定することをおすすめします。
          </p>
        </TabsContent>

        {/* フッターメニュー */}
        <TabsContent value="footer" className="mt-6">
          {renderNavTable(footerItems, 'FOOTER', 'フッターメニューがありません')}
        </TabsContent>

        {/* SNSリンク */}
        <TabsContent value="social" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>SNSリンク</CardTitle>
              <Button size="sm" onClick={openSocialCreateDialog}>
                追加
              </Button>
            </CardHeader>
            <CardContent>
              {socialLinks.length === 0 ? (
                <p className="py-4 text-center text-muted-foreground">
                  SNSリンクがありません
                </p>
              ) : (
                <>
                  <p className="mb-4 text-sm text-muted-foreground">
                    ドラッグ&ドロップで順序を変更できます
                  </p>
                  <DndContext
                    sensors={sensors}
                    collisionDetection={closestCenter}
                    onDragEnd={handleSocialDragEnd}
                  >
                    <SortableContext
                      items={socialLinks.map((link) => link.id)}
                      strategy={verticalListSortingStrategy}
                    >
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12"></TableHead>
                            <TableHead className="w-32">プラットフォーム</TableHead>
                            <TableHead>URL</TableHead>
                            <TableHead className="w-24">PC</TableHead>
                            <TableHead className="w-24">モバイル</TableHead>
                            <TableHead className="w-24">有効</TableHead>
                            <TableHead className="w-32">操作</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {socialLinks.map((link) => (
                            <SortableSocialRow
                              key={link.id}
                              link={link}
                              onEdit={openSocialEditDialog}
                              onDelete={handleSocialDelete}
                              isPending={isPending}
                            />
                          ))}
                        </TableBody>
                      </Table>
                    </SortableContext>
                  </DndContext>
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* ナビゲーション作成/編集ダイアログ */}
      <Dialog open={isNavDialogOpen} onOpenChange={setIsNavDialogOpen}>
        <DialogContent>
          <form onSubmit={navForm.handleSubmit(onNavSubmit)}>
            <DialogHeader>
              <DialogTitle>
                {editingNavItem ? 'メニュー編集' : 'メニュー追加'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="nav-label">ラベル</Label>
                <Input
                  id="nav-label"
                  {...navForm.register('label')}
                  placeholder="メニューラベル"
                  disabled={isPending}
                />
                {navForm.formState.errors.label && (
                  <p className="text-sm text-destructive">
                    {navForm.formState.errors.label.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="nav-url">URL</Label>
                <Input
                  id="nav-url"
                  {...navForm.register('url')}
                  placeholder="/about"
                  disabled={isPending}
                />
                {navForm.formState.errors.url && (
                  <p className="text-sm text-destructive">
                    {navForm.formState.errors.url.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="nav-parentId">親メニュー（サブメニューの場合）</Label>
                <Select
                  value={navParentId || 'none'}
                  onValueChange={(value) =>
                    navForm.setValue('parentId', value === 'none' ? null : value)
                  }
                  disabled={isPending}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="なし（トップレベル）" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">なし（トップレベル）</SelectItem>
                    {getParentOptions(navType).map((parent) => (
                      <SelectItem key={parent.id} value={parent.id}>
                        {parent.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  サブメニューにする場合は親メニューを選択してください
                </p>
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="nav-isExternal">外部リンク</Label>
                <Switch
                  id="nav-isExternal"
                  checked={navIsExternal}
                  onCheckedChange={(checked) => navForm.setValue('isExternal', checked)}
                  disabled={isPending}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="nav-isActive">有効</Label>
                <Switch
                  id="nav-isActive"
                  checked={navIsActive}
                  onCheckedChange={(checked) => navForm.setValue('isActive', checked)}
                  disabled={isPending}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsNavDialogOpen(false)}
                disabled={isPending}
              >
                キャンセル
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? (editingNavItem ? '更新中...' : '作成中...') : editingNavItem ? '更新' : '作成'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* SNSリンク作成/編集ダイアログ */}
      <Dialog open={isSocialDialogOpen} onOpenChange={setIsSocialDialogOpen}>
        <DialogContent>
          <form onSubmit={socialForm.handleSubmit(onSocialSubmit)}>
            <DialogHeader>
              <DialogTitle>
                {editingSocialLink ? 'SNSリンク編集' : 'SNSリンク追加'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="social-platform">プラットフォーム</Label>
                <Select
                  value={socialPlatform}
                  onValueChange={(value) => {
                    if (isValidSocialPlatform(value)) {
                      socialForm.setValue('platform', value)
                    }
                  }}
                  disabled={isPending}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(platformLabels).map(([value, label]) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="social-url">URL</Label>
                <Input
                  id="social-url"
                  {...socialForm.register('url')}
                  placeholder="https://twitter.com/..."
                  disabled={isPending}
                />
                {socialForm.formState.errors.url && (
                  <p className="text-sm text-destructive">
                    {socialForm.formState.errors.url.message}
                  </p>
                )}
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="social-isActive">有効</Label>
                <Switch
                  id="social-isActive"
                  checked={socialIsActive}
                  onCheckedChange={(checked) => socialForm.setValue('isActive', checked)}
                  disabled={isPending}
                />
              </div>

              <div className="rounded-lg border p-4 space-y-4">
                <p className="text-sm font-medium">表示設定</p>
                <div className="flex items-center justify-between">
                  <Label htmlFor="social-showOnDesktop">デスクトップで表示</Label>
                  <Switch
                    id="social-showOnDesktop"
                    checked={socialShowOnDesktop}
                    onCheckedChange={(checked) => socialForm.setValue('showOnDesktop', checked)}
                    disabled={isPending}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="social-showOnMobile">モバイルで表示</Label>
                  <Switch
                    id="social-showOnMobile"
                    checked={socialShowOnMobile}
                    onCheckedChange={(checked) => socialForm.setValue('showOnMobile', checked)}
                    disabled={isPending}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsSocialDialogOpen(false)}
                disabled={isPending}
              >
                キャンセル
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending ? (editingSocialLink ? '更新中...' : '作成中...') : editingSocialLink ? '更新' : '作成'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
