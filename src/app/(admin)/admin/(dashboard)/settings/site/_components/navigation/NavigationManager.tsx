'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  sortableKeyboardCoordinates,
  arrayMove,
  type DragEndEvent,
} from '@/admin/components/ui'
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
  NavigationItemInput,
  SocialLinkInput,
} from '@/shared/domain/navigation/commands'
import type { NavigationType } from '@/shared/db/enums'
import type { NavigationItemData, SocialLinkData, NavFormData, SocialFormData } from './types'
import { useNavigationForm, useSocialForm, flattenNavItems } from './hooks/use-navigation-form'
import { NavigationList, SocialLinkList } from './NavigationList'
import { NavigationDialog, SocialLinkDialog } from './NavigationDialog'

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

  // Form Hooks
  const navFormHook = useNavigationForm()
  const socialFormHook = useSocialForm()

  // Load Data
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
    navFormHook.resetForCreate(type, flatItems.length)
    setIsNavDialogOpen(true)
  }

  const openNavEditDialog = (item: NavigationItemData) => {
    setEditingNavItem(item)
    navFormHook.resetForEdit(item)
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
    socialFormHook.resetForCreate(socialLinks.length)
    setIsSocialDialogOpen(true)
  }

  const openSocialEditDialog = (link: SocialLinkData) => {
    setEditingSocialLink(link)
    socialFormHook.resetForEdit(link)
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

  return (
    <div className="space-y-6">
      <Tabs defaultValue="desktop">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="desktop">デスクトップ</TabsTrigger>
          <TabsTrigger value="mobile">モバイル</TabsTrigger>
          <TabsTrigger value="footer">フッター</TabsTrigger>
          <TabsTrigger value="social">SNSリンク</TabsTrigger>
        </TabsList>

        <TabsContent value="desktop" className="mt-6">
          <NavigationList
            items={flattenNavItems(desktopItems)}
            type="HEADER_DESKTOP"
            emptyMessage="デスクトップメニューがありません"
            sensors={sensors}
            isPending={isPending}
            onAdd={openNavCreateDialog}
            onEdit={openNavEditDialog}
            onDelete={handleNavDelete}
            onDragEnd={handleNavDragEnd('HEADER_DESKTOP')}
          />
        </TabsContent>

        <TabsContent value="mobile" className="mt-6">
          <NavigationList
            items={flattenNavItems(mobileItems)}
            type="HEADER_MOBILE"
            emptyMessage="モバイルメニューがありません"
            sensors={sensors}
            isPending={isPending}
            onAdd={openNavCreateDialog}
            onEdit={openNavEditDialog}
            onDelete={handleNavDelete}
            onDragEnd={handleNavDragEnd('HEADER_MOBILE')}
          />
          <p className="mt-4 text-sm text-muted-foreground">
            モバイルでは項目数を少なめに設定することをおすすめします。
          </p>
        </TabsContent>

        <TabsContent value="footer" className="mt-6">
          <NavigationList
            items={flattenNavItems(footerItems)}
            type="FOOTER"
            emptyMessage="フッターメニューがありません"
            sensors={sensors}
            isPending={isPending}
            onAdd={openNavCreateDialog}
            onEdit={openNavEditDialog}
            onDelete={handleNavDelete}
            onDragEnd={handleNavDragEnd('FOOTER')}
          />
        </TabsContent>

        <TabsContent value="social" className="mt-6">
          <SocialLinkList
            links={socialLinks}
            sensors={sensors}
            isPending={isPending}
            onAdd={openSocialCreateDialog}
            onEdit={openSocialEditDialog}
            onDelete={handleSocialDelete}
            onDragEnd={handleSocialDragEnd}
          />
        </TabsContent>
      </Tabs>

      <NavigationDialog
        open={isNavDialogOpen}
        onOpenChange={setIsNavDialogOpen}
        form={navFormHook.form}
        editingItem={editingNavItem}
        isPending={isPending}
        navIsExternal={navFormHook.navIsExternal}
        navIsActive={navFormHook.navIsActive}
        navParentId={navFormHook.navParentId}
        parentOptions={getParentOptions(navFormHook.navType)}
        onSubmit={onNavSubmit}
      />

      <SocialLinkDialog
        open={isSocialDialogOpen}
        onOpenChange={setIsSocialDialogOpen}
        form={socialFormHook.form}
        editingLink={editingSocialLink}
        isPending={isPending}
        socialPlatform={socialFormHook.socialPlatform}
        socialIsActive={socialFormHook.socialIsActive}
        socialShowOnDesktop={socialFormHook.socialShowOnDesktop}
        socialShowOnMobile={socialFormHook.socialShowOnMobile}
        onSubmit={onSocialSubmit}
      />
    </div>
  )
}
