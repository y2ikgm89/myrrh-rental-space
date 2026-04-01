"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import {
  arrayMove,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type DragOverEvent,
} from "@/admin/components/ui";
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
} from "../types";
import { rebuildHierarchy } from "../types";
import { flattenNavItems } from "./use-navigation-form";
import {
  computeOrderWithNesting,
  computeOrderFromFlat,
  fetchNavigationItems,
  fetchSocialLinks,
} from "../navigation-utils";
import { getProjectedDepth } from "../types";

// =============================================================================
// State Shape
// =============================================================================

export type NavigationState = {
  desktopItems: NavigationItemData[];
  mobileItems: NavigationItemData[];
  footerItems: NavigationItemData[];
  socialLinks: Serialized<SocialLinkData>[];
  isNavDialogOpen: boolean;
  editingNavItem: NavigationItemData | null;
  isSocialDialogOpen: boolean;
  editingSocialLink: Serialized<SocialLinkData> | null;
  dragOffsetX: number;
  activeItemId: string | null;
  overItemId: string | null;
  activeSocialId: string | null;
};

export type NavigationStateSetters = {
  setDesktopItems: (items: NavigationItemData[]) => void;
  setMobileItems: (items: NavigationItemData[]) => void;
  setFooterItems: (items: NavigationItemData[]) => void;
  setSocialLinks: (links: Serialized<SocialLinkData>[]) => void;
  setIsNavDialogOpen: (open: boolean) => void;
  setEditingNavItem: (item: NavigationItemData | null) => void;
  setIsSocialDialogOpen: (open: boolean) => void;
  setEditingSocialLink: (link: Serialized<SocialLinkData> | null) => void;
  setDragOffsetX: (x: number) => void;
  setActiveItemId: (id: string | null) => void;
  setOverItemId: (id: string | null) => void;
  setActiveSocialId: (id: string | null) => void;
};

export type NavigationFormHooks = {
  navFormHook: {
    resetForCreate: (type: NavigationType, order: number) => void;
    resetForEdit: (item: NavigationItemData) => void;
  };
  socialFormHook: {
    resetForCreate: (order: number) => void;
    resetForEdit: (link: Serialized<SocialLinkData>) => void;
  };
};

// =============================================================================
// Hook
// =============================================================================

export function useNavigationHandlers(
  state: NavigationState,
  setters: NavigationStateSetters,
  formHooks: NavigationFormHooks,
) {
  const [isPending, startTransition] = useTransition();

  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------

  const getItemsByType = (type: NavigationType): NavigationItemData[] => {
    switch (type) {
      case "HEADER_DESKTOP":
        return state.desktopItems;
      case "HEADER_MOBILE":
        return state.mobileItems;
      case "FOOTER":
        return state.footerItems;
      default:
        return [];
    }
  };

  const setItemsByType = (
    type: NavigationType,
    items: NavigationItemData[],
  ) => {
    switch (type) {
      case "HEADER_DESKTOP":
        setters.setDesktopItems(items);
        break;
      case "HEADER_MOBILE":
        setters.setMobileItems(items);
        break;
      case "FOOTER":
        setters.setFooterItems(items);
        break;
    }
  };

  const loadData = async () => {
    const [desktop, mobile, footer, social] = await Promise.all([
      fetchNavigationItems("HEADER_DESKTOP"),
      fetchNavigationItems("HEADER_MOBILE"),
      fetchNavigationItems("FOOTER"),
      fetchSocialLinks(),
    ]);
    setters.setDesktopItems(desktop);
    setters.setMobileItems(mobile);
    setters.setFooterItems(footer);
    setters.setSocialLinks(social);
  };

  // ---------------------------------------------------------------------------
  // Navigation Item Handlers
  // ---------------------------------------------------------------------------

  const getParentOptions = (type: NavigationType): NavigationItemData[] => {
    return getItemsByType(type).filter((item) => !item.parentId);
  };

  const openNavCreateDialog = (type: NavigationType) => {
    setters.setEditingNavItem(null);
    const items = getItemsByType(type);
    const flatItems = flattenNavItems(items);
    formHooks.navFormHook.resetForCreate(type, flatItems.length);
    setters.setIsNavDialogOpen(true);
  };

  const openNavEditDialog = (item: NavigationItemData) => {
    setters.setEditingNavItem(item);
    formHooks.navFormHook.resetForEdit(item);
    setters.setIsNavDialogOpen(true);
  };

  const onNavSubmit = (data: NavFormData) => {
    startTransition(async () => {
      const payload: NavigationItemInput = {
        ...data,
        parentId: data.parentId || null,
      };

      if (state.editingNavItem) {
        const result = await updateNavigationItem(
          state.editingNavItem.id,
          payload,
        );
        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }

        toast.success("ナビゲーションを更新しました");
        setters.setIsNavDialogOpen(false);
        void loadData();
      } else {
        const result = await createNavigationItem(payload);
        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }

        toast.success("ナビゲーションを作成しました");
        setters.setIsNavDialogOpen(false);
        void loadData();
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
      void loadData();
    });
  };

  // ---------------------------------------------------------------------------
  // Navigation D&D Handlers
  // ---------------------------------------------------------------------------

  const handleNavDragStart =
    (_type: NavigationType) => (event: DragStartEvent) => {
      setters.setActiveItemId(String(event.active.id));
      setters.setDragOffsetX(0);
      setters.setOverItemId(null);
    };

  const handleNavDragMove =
    (_type: NavigationType) => (event: DragMoveEvent) => {
      setters.setActiveItemId(String(event.active.id));
      setters.setDragOffsetX(event.delta.x);
    };

  const handleNavDragOver =
    (_type: NavigationType) => (event: DragOverEvent) => {
      setters.setOverItemId(event.over ? String(event.over.id) : null);
    };

  const handleNavDragEnd = (type: NavigationType) => (event: DragEndEvent) => {
    const { active, over } = event;
    const currentOffsetX = event.delta.x;

    // Reset drag state
    setters.setActiveItemId(null);
    setters.setDragOffsetX(0);
    setters.setOverItemId(null);

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

    // Optimistic: update local state immediately
    const newHierarchical = rebuildHierarchy(updates, flatItems);
    setItemsByType(type, newHierarchical);

    // Background: send to server
    startTransition(async () => {
      const result = await updateNavigationOrder(updates);
      if (isMutationError(result)) {
        toast.error(result.error);
        void loadData(); // Rollback on error
        return;
      }

      toast.success("順序を更新しました");
    });
  };

  // ---------------------------------------------------------------------------
  // Indent/Outdent Handlers
  // ---------------------------------------------------------------------------

  const handleMakeChild = (type: NavigationType) => (id: string) => {
    const items = getItemsByType(type);
    const flatItems = flattenNavItems(items);

    const itemIndex = flatItems.findIndex((item) => item.id === id);
    if (itemIndex === -1) return;

    const item = flatItems[itemIndex];
    if (!item || item.depth !== 0) return;

    // Find the previous root item
    let prevRootIndex = -1;
    for (let i = itemIndex - 1; i >= 0; i--) {
      const prev = flatItems[i];
      if (prev && prev.depth === 0) {
        prevRootIndex = i;
        break;
      }
    }
    if (prevRootIndex === -1) return;

    // Update the item's depth to 1
    const updatedFlat = flatItems.map((fi, idx) =>
      idx === itemIndex ? { ...fi, depth: 1 as const, isChild: true } : fi,
    );

    const updates = computeOrderFromFlat(updatedFlat);

    // Optimistic update
    const newHierarchical = rebuildHierarchy(updates, updatedFlat);
    setItemsByType(type, newHierarchical);

    startTransition(async () => {
      const result = await updateNavigationOrder(updates);
      if (isMutationError(result)) {
        toast.error(result.error);
        void loadData();
        return;
      }

      toast.success("サブメニューに変更しました");
    });
  };

  const handleMakeRoot = (type: NavigationType) => (id: string) => {
    const items = getItemsByType(type);
    const flatItems = flattenNavItems(items);

    const itemIndex = flatItems.findIndex((item) => item.id === id);
    if (itemIndex === -1) return;

    const item = flatItems[itemIndex];
    if (!item || item.depth !== 1) return;

    // Update the item's depth to 0
    const updatedFlat = flatItems.map((fi, idx) =>
      idx === itemIndex ? { ...fi, depth: 0 as const, isChild: false } : fi,
    );

    const updates = computeOrderFromFlat(updatedFlat);

    // Optimistic update
    const newHierarchical = rebuildHierarchy(updates, updatedFlat);
    setItemsByType(type, newHierarchical);

    startTransition(async () => {
      const result = await updateNavigationOrder(updates);
      if (isMutationError(result)) {
        toast.error(result.error);
        void loadData();
        return;
      }

      toast.success("トップレベルに移動しました");
    });
  };

  // ---------------------------------------------------------------------------
  // Social Link Handlers
  // ---------------------------------------------------------------------------

  const openSocialCreateDialog = () => {
    setters.setEditingSocialLink(null);
    formHooks.socialFormHook.resetForCreate(state.socialLinks.length);
    setters.setIsSocialDialogOpen(true);
  };

  const openSocialEditDialog = (link: Serialized<SocialLinkData>) => {
    setters.setEditingSocialLink(link);
    formHooks.socialFormHook.resetForEdit(link);
    setters.setIsSocialDialogOpen(true);
  };

  const onSocialSubmit = (data: SocialFormData) => {
    startTransition(async () => {
      const payload: SocialLinkInput = data;

      if (state.editingSocialLink) {
        const result = await updateSocialLink(
          state.editingSocialLink.id,
          payload,
        );
        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }

        toast.success("SNSリンクを更新しました");
        setters.setIsSocialDialogOpen(false);
        void loadData();
      } else {
        const result = await createSocialLink(payload);
        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }

        toast.success("SNSリンクを作成しました");
        setters.setIsSocialDialogOpen(false);
        void loadData();
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
      void loadData();
    });
  };

  // ---------------------------------------------------------------------------
  // Social D&D Handlers
  // ---------------------------------------------------------------------------

  const handleSocialDragStart = (event: DragStartEvent) => {
    setters.setActiveSocialId(String(event.active.id));
  };

  const handleSocialDragEnd = (event: DragEndEvent) => {
    setters.setActiveSocialId(null);
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = state.socialLinks.findIndex(
      (link) => link.id === active.id,
    );
    const newIndex = state.socialLinks.findIndex((link) => link.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(state.socialLinks, oldIndex, newIndex);
    setters.setSocialLinks(reordered);

    const updates = reordered.map((link, index) => ({
      id: link.id,
      order: index,
    }));

    startTransition(async () => {
      const result = await updateSocialLinkOrder(updates);
      if (isMutationError(result)) {
        toast.error(result.error);
        void loadData();
        return;
      }

      toast.success("順序を更新しました");
    });
  };

  return {
    isPending,
    getParentOptions,
    openNavCreateDialog,
    openNavEditDialog,
    onNavSubmit,
    handleNavDelete,
    handleNavDragStart,
    handleNavDragMove,
    handleNavDragOver,
    handleNavDragEnd,
    handleMakeChild,
    handleMakeRoot,
    openSocialCreateDialog,
    openSocialEditDialog,
    onSocialSubmit,
    handleSocialDelete,
    handleSocialDragStart,
    handleSocialDragEnd,
  };
}
