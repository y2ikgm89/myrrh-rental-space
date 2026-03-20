"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
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
  type DragMoveEvent,
  type DragStartEvent,
} from "@/admin/components/ui";
import { fetchAdminJson } from "@/admin/lib/admin-api-client";
import {
  createNavigationItem,
  updateNavigationItem,
  deleteNavigationItem,
  updateNavigationOrder,
  createSocialLink,
  updateSocialLink,
  deleteSocialLink,
  updateSocialLinkOrder,
} from "@/admin/actions/navigation";
import type { Serialized } from "@/shared/lib/serialize";
import type {
  NavigationItemInput,
  SocialLinkInput,
} from "@/shared/domain/navigation/commands";
import type { NavigationType } from "@/shared/db/enums";
import { isMutationError } from "@/shared/lib/mutation-result";
import type {
  NavigationItemData,
  SocialLinkData,
  NavFormData,
  SocialFormData,
  FlatNavigationItem,
} from "./types";
import {
  useNavigationForm,
  useSocialForm,
  flattenNavItems,
} from "./hooks/use-navigation-form";
import { NavigationList, SocialLinkList } from "./NavigationList";
import { NavigationDialog, SocialLinkDialog } from "./NavigationDialog";

// =============================================================================
// Indentation Constants
// =============================================================================

const INDENT_WIDTH = 50;

function getProjectedDepth(offsetX: number, currentDepth: 0 | 1): 0 | 1 {
  const projectedPixels = currentDepth * INDENT_WIDTH + offsetX;
  const raw = Math.round(projectedPixels / INDENT_WIDTH);
  return Math.max(0, Math.min(1, raw)) === 1 ? 1 : 0;
}

/**
 * After reorder, walk through items top-to-bottom and assign parentId
 * based on the projected depth of the dragged item.
 * Non-dragged items keep their existing depth (isChild).
 */
function computeOrderWithNesting(
  reordered: FlatNavigationItem[],
  draggedId: string,
  offsetX: number,
  draggedOriginalDepth: 0 | 1,
): { id: string; order: number; parentId: string | null }[] {
  const projectedDepth = getProjectedDepth(offsetX, draggedOriginalDepth);

  // Build depth map: dragged item gets projected depth, others keep existing
  const depths = reordered.map((item) => ({
    item,
    depth: item.id === draggedId ? projectedDepth : item.depth,
  }));

  // Walk top-to-bottom, track the last root-level item
  let lastRootId: string | null = null;
  const updates: { id: string; order: number; parentId: string | null }[] = [];

  for (let i = 0; i < depths.length; i++) {
    const entry = depths[i];
    if (!entry) continue;

    const { item, depth } = entry;

    if (depth === 1 && lastRootId !== null) {
      // Child: parent is the last root item above
      updates.push({ id: item.id, order: i, parentId: lastRootId });
    } else {
      // Root item (or forced root because no parent above)
      updates.push({ id: item.id, order: i, parentId: null });
      lastRootId = item.id;
    }
  }

  return updates;
}

// =============================================================================
// Props
// =============================================================================

type NavigationManagerProps = {
  initialDesktopItems: NavigationItemData[];
  initialMobileItems: NavigationItemData[];
  initialFooterItems: NavigationItemData[];
  initialSocialLinks: Serialized<SocialLinkData>[];
};

async function fetchNavigationItems(
  type: NavigationType,
): Promise<NavigationItemData[]> {
  const searchParams = new URLSearchParams({ type });
  return fetchAdminJson(`/admin/api/navigation?${searchParams.toString()}`);
}

async function fetchSocialLinks(): Promise<Serialized<SocialLinkData>[]> {
  return fetchAdminJson("/admin/api/navigation/social-links");
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
  const [isPending, startTransition] = useTransition();

  // Navigation Items State
  const [desktopItems, setDesktopItems] =
    useState<NavigationItemData[]>(initialDesktopItems);
  const [mobileItems, setMobileItems] =
    useState<NavigationItemData[]>(initialMobileItems);
  const [footerItems, setFooterItems] =
    useState<NavigationItemData[]>(initialFooterItems);
  const [isNavDialogOpen, setIsNavDialogOpen] = useState(false);
  const [editingNavItem, setEditingNavItem] =
    useState<NavigationItemData | null>(null);

  // Social Links State
  const [socialLinks, setSocialLinks] =
    useState<Serialized<SocialLinkData>[]>(initialSocialLinks);
  const [isSocialDialogOpen, setIsSocialDialogOpen] = useState(false);
  const [editingSocialLink, setEditingSocialLink] =
    useState<Serialized<SocialLinkData> | null>(null);

  // D&D Drag-to-nest State
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);

  // D&D Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  // Form Hooks
  const navFormHook = useNavigationForm();
  const socialFormHook = useSocialForm();

  // Load Data
  const loadData = async () => {
    const [desktop, mobile, footer, social] = await Promise.all([
      fetchNavigationItems("HEADER_DESKTOP"),
      fetchNavigationItems("HEADER_MOBILE"),
      fetchNavigationItems("FOOTER"),
      fetchSocialLinks(),
    ]);
    setDesktopItems(desktop);
    setMobileItems(mobile);
    setFooterItems(footer);
    setSocialLinks(social);
  };

  // Navigation Item Handlers
  const getItemsByType = (type: NavigationType): NavigationItemData[] => {
    switch (type) {
      case "HEADER_DESKTOP":
        return desktopItems;
      case "HEADER_MOBILE":
        return mobileItems;
      case "FOOTER":
        return footerItems;
      default:
        return [];
    }
  };

  const getParentOptions = (type: NavigationType): NavigationItemData[] => {
    return getItemsByType(type).filter((item) => !item.parentId);
  };

  const openNavCreateDialog = (type: NavigationType) => {
    setEditingNavItem(null);
    const items = getItemsByType(type);
    const flatItems = flattenNavItems(items);
    navFormHook.resetForCreate(type, flatItems.length);
    setIsNavDialogOpen(true);
  };

  const openNavEditDialog = (item: NavigationItemData) => {
    setEditingNavItem(item);
    navFormHook.resetForEdit(item);
    setIsNavDialogOpen(true);
  };

  const onNavSubmit = (data: NavFormData) => {
    startTransition(async () => {
      const payload: NavigationItemInput = {
        ...data,
        parentId: data.parentId || null,
      };

      if (editingNavItem) {
        const result = await updateNavigationItem(editingNavItem.id, payload);
        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }

        toast.success("ナビゲーションを更新しました");
        setIsNavDialogOpen(false);
        loadData();
      } else {
        const result = await createNavigationItem(payload);
        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }

        toast.success("ナビゲーションを作成しました");
        setIsNavDialogOpen(false);
        loadData();
      }
    });
  };

  const handleNavDelete = (id: string) => {
    startTransition(async () => {
      const result = await deleteNavigationItem(id);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success("ナビゲーションを削除しました");
      loadData();
    });
  };

  // Navigation D&D Handlers
  const handleNavDragStart =
    (_type: NavigationType) => (event: DragStartEvent) => {
      setActiveItemId(String(event.active.id));
      setDragOffsetX(0);
    };

  const handleNavDragMove =
    (_type: NavigationType) => (event: DragMoveEvent) => {
      setActiveItemId(String(event.active.id));
      setDragOffsetX(event.delta.x);
    };

  const handleNavDragEnd = (type: NavigationType) => (event: DragEndEvent) => {
    const { active, over } = event;
    const currentOffsetX = event.delta.x;

    // Reset drag state
    setActiveItemId(null);
    setDragOffsetX(0);

    if (!over) return;

    const items = getItemsByType(type);
    const flatItems = flattenNavItems(items);

    const oldIndex = flatItems.findIndex((item) => item.id === active.id);

    if (oldIndex === -1) return;

    const draggedItem = flatItems[oldIndex];
    if (!draggedItem) return;

    // Check if only depth changed (horizontal drag with no vertical reorder)
    const projectedDepth = getProjectedDepth(currentOffsetX, draggedItem.depth);
    const samePosition = active.id === over.id;

    if (samePosition && projectedDepth === draggedItem.depth) return;

    const newIndex = samePosition
      ? oldIndex
      : flatItems.findIndex((item) => item.id === over.id);

    if (newIndex === -1) return;

    const reordered = samePosition
      ? flatItems
      : arrayMove(flatItems, oldIndex, newIndex);

    // Compute parentId for each item based on projected depth
    const updates = computeOrderWithNesting(
      reordered,
      String(active.id),
      currentOffsetX,
      draggedItem.depth,
    );

    startTransition(async () => {
      const result = await updateNavigationOrder(updates);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success("順序を更新しました");
      loadData();
    });
  };

  // Social Link Handlers
  const openSocialCreateDialog = () => {
    setEditingSocialLink(null);
    socialFormHook.resetForCreate(socialLinks.length);
    setIsSocialDialogOpen(true);
  };

  const openSocialEditDialog = (link: Serialized<SocialLinkData>) => {
    setEditingSocialLink(link);
    socialFormHook.resetForEdit(link);
    setIsSocialDialogOpen(true);
  };

  const onSocialSubmit = (data: SocialFormData) => {
    startTransition(async () => {
      const payload: SocialLinkInput = data;

      if (editingSocialLink) {
        const result = await updateSocialLink(editingSocialLink.id, payload);
        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }

        toast.success("SNSリンクを更新しました");
        setIsSocialDialogOpen(false);
        loadData();
      } else {
        const result = await createSocialLink(payload);
        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }

        toast.success("SNSリンクを作成しました");
        setIsSocialDialogOpen(false);
        loadData();
      }
    });
  };

  const handleSocialDelete = (id: string) => {
    startTransition(async () => {
      const result = await deleteSocialLink(id);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success("SNSリンクを削除しました");
      loadData();
    });
  };

  // Social D&D Handler
  const handleSocialDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = socialLinks.findIndex((link) => link.id === active.id);
    const newIndex = socialLinks.findIndex((link) => link.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(socialLinks, oldIndex, newIndex);
    setSocialLinks(reordered);

    const updates = reordered.map((link, index) => ({
      id: link.id,
      order: index,
    }));

    startTransition(async () => {
      const result = await updateSocialLinkOrder(updates);
      if (isMutationError(result)) {
        toast.error(result.error);
        loadData();
        return;
      }

      toast.success("順序を更新しました");
    });
  };

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
            activeItemId={activeItemId}
            dragOffsetX={dragOffsetX}
            onAdd={openNavCreateDialog}
            onEdit={openNavEditDialog}
            onDelete={handleNavDelete}
            onDragStart={handleNavDragStart("HEADER_DESKTOP")}
            onDragMove={handleNavDragMove("HEADER_DESKTOP")}
            onDragEnd={handleNavDragEnd("HEADER_DESKTOP")}
          />
        </TabsContent>

        <TabsContent value="mobile" className="mt-6">
          <NavigationList
            items={flattenNavItems(mobileItems)}
            type="HEADER_MOBILE"
            emptyMessage="モバイルメニューがありません"
            sensors={sensors}
            isPending={isPending}
            activeItemId={activeItemId}
            dragOffsetX={dragOffsetX}
            onAdd={openNavCreateDialog}
            onEdit={openNavEditDialog}
            onDelete={handleNavDelete}
            onDragStart={handleNavDragStart("HEADER_MOBILE")}
            onDragMove={handleNavDragMove("HEADER_MOBILE")}
            onDragEnd={handleNavDragEnd("HEADER_MOBILE")}
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
            activeItemId={activeItemId}
            dragOffsetX={dragOffsetX}
            onAdd={openNavCreateDialog}
            onEdit={openNavEditDialog}
            onDelete={handleNavDelete}
            onDragStart={handleNavDragStart("FOOTER")}
            onDragMove={handleNavDragMove("FOOTER")}
            onDragEnd={handleNavDragEnd("FOOTER")}
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
  );
}
