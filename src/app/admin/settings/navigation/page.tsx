'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
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
} from '@/components/admin/ui'
import {
  getNavigationItems,
  createNavigationItem,
  updateNavigationItem,
  deleteNavigationItem,
  getSocialLinks,
  createSocialLink,
  updateSocialLink,
  deleteSocialLink,
} from '@/actions/admin/navigation'
import type {
  NavigationItemData,
  NavigationItemInput,
  SocialLinkData,
  SocialLinkInput,
} from '@/actions/admin/navigation'
import type { NavigationType, SocialPlatform } from '@/generated/prisma/client/enums'

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
// Component
// =============================================================================

export default function NavigationSettingsPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  // Navigation Items State
  const [desktopItems, setDesktopItems] = useState<NavigationItemData[]>([])
  const [mobileItems, setMobileItems] = useState<NavigationItemData[]>([])
  const [footerItems, setFooterItems] = useState<NavigationItemData[]>([])
  const [isNavDialogOpen, setIsNavDialogOpen] = useState(false)
  const [editingNavItem, setEditingNavItem] = useState<NavigationItemData | null>(null)
  const [deleteNavTargetId, setDeleteNavTargetId] = useState<string | null>(null)

  // Social Links State
  const [socialLinks, setSocialLinks] = useState<SocialLinkData[]>([])
  const [isSocialDialogOpen, setIsSocialDialogOpen] = useState(false)
  const [editingSocialLink, setEditingSocialLink] = useState<SocialLinkData | null>(null)
  const [deleteSocialTargetId, setDeleteSocialTargetId] = useState<string | null>(null)

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

  useEffect(() => {
    loadData()
  }, [])

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

  const openNavCreateDialog = (type: NavigationType) => {
    setEditingNavItem(null)
    const items = getItemsByType(type)
    navForm.reset({
      type,
      parentId: null,
      label: '',
      url: '',
      isExternal: false,
      order: items.length,
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
          alert(result.error)
        }
      } else {
        const result = await createNavigationItem(payload)
        if (result.success) {
          setIsNavDialogOpen(false)
          loadData()
        } else {
          alert(result.error)
        }
      }
    })
  }

  const handleNavDelete = (id: string) => {
    startTransition(async () => {
      const result = await deleteNavigationItem(id)
      if (result.success) {
        setDeleteNavTargetId(null)
        loadData()
      } else {
        alert(result.error)
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
          alert(result.error)
        }
      } else {
        const result = await createSocialLink(payload)
        if (result.success) {
          setIsSocialDialogOpen(false)
          loadData()
        } else {
          alert(result.error)
        }
      }
    })
  }

  const handleSocialDelete = (id: string) => {
    startTransition(async () => {
      const result = await deleteSocialLink(id)
      if (result.success) {
        setDeleteSocialTargetId(null)
        loadData()
      } else {
        alert(result.error)
      }
    })
  }

  // Render navigation table
  const renderNavTable = (items: NavigationItemData[], type: NavigationType, emptyMessage: string) => (
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
        {items.length === 0 ? (
          <p className="py-4 text-center text-muted-foreground">{emptyMessage}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-16">順序</TableHead>
                <TableHead>ラベル</TableHead>
                <TableHead>URL</TableHead>
                <TableHead className="w-24">外部</TableHead>
                <TableHead className="w-24">有効</TableHead>
                <TableHead className="w-32">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item) => (
                <TableRow key={item.id}>
                  <TableCell>{item.order}</TableCell>
                  <TableCell className="font-medium">{item.label}</TableCell>
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
                        onClick={() => openNavEditDialog(item)}
                        disabled={isPending}
                      >
                        編集
                      </Button>
                      <Dialog
                        open={deleteNavTargetId === item.id}
                        onOpenChange={(open) =>
                          setDeleteNavTargetId(open ? item.id : null)
                        }
                      >
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
                              onClick={() => setDeleteNavTargetId(null)}
                              disabled={isPending}
                            >
                              キャンセル
                            </Button>
                            <Button
                              variant="destructive"
                              onClick={() => handleNavDelete(item.id)}
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
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  )

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">ナビゲーション管理</h1>
          <p className="text-muted-foreground">
            デスクトップ・モバイル別のメニューとSNSリンクを管理します
          </p>
        </div>
        <Button variant="outline" onClick={() => router.push('/admin/settings')}>
          設定に戻る
        </Button>
      </div>

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
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-16">順序</TableHead>
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
                      <TableRow key={link.id}>
                        <TableCell>{link.order}</TableCell>
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
                              onClick={() => openSocialEditDialog(link)}
                              disabled={isPending}
                            >
                              編集
                            </Button>
                            <Dialog
                              open={deleteSocialTargetId === link.id}
                              onOpenChange={(open) =>
                                setDeleteSocialTargetId(open ? link.id : null)
                              }
                            >
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
                                    onClick={() => setDeleteSocialTargetId(null)}
                                    disabled={isPending}
                                  >
                                    キャンセル
                                  </Button>
                                  <Button
                                    variant="destructive"
                                    onClick={() => handleSocialDelete(link.id)}
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
                    ))}
                  </TableBody>
                </Table>
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
                <Label htmlFor="nav-order">表示順</Label>
                <Input
                  id="nav-order"
                  type="number"
                  {...navForm.register('order', { valueAsNumber: true })}
                  disabled={isPending}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="nav-isExternal">外部リンク</Label>
                <Switch
                  id="nav-isExternal"
                  checked={navForm.watch('isExternal')}
                  onCheckedChange={(checked) => navForm.setValue('isExternal', checked)}
                  disabled={isPending}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="nav-isActive">有効</Label>
                <Switch
                  id="nav-isActive"
                  checked={navForm.watch('isActive')}
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
                {isPending ? '保存中...' : editingNavItem ? '更新' : '作成'}
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
                  value={socialForm.watch('platform')}
                  onValueChange={(value) =>
                    socialForm.setValue('platform', value as SocialPlatform)
                  }
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

              <div className="space-y-2">
                <Label htmlFor="social-order">表示順</Label>
                <Input
                  id="social-order"
                  type="number"
                  {...socialForm.register('order', { valueAsNumber: true })}
                  disabled={isPending}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label htmlFor="social-isActive">有効</Label>
                <Switch
                  id="social-isActive"
                  checked={socialForm.watch('isActive')}
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
                    checked={socialForm.watch('showOnDesktop')}
                    onCheckedChange={(checked) => socialForm.setValue('showOnDesktop', checked)}
                    disabled={isPending}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <Label htmlFor="social-showOnMobile">モバイルで表示</Label>
                  <Switch
                    id="social-showOnMobile"
                    checked={socialForm.watch('showOnMobile')}
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
                {isPending ? '保存中...' : editingSocialLink ? '更新' : '作成'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
