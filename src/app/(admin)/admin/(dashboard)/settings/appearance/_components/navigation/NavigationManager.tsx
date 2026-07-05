"use client";

import { useState } from "react";
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
} from "@/admin/components/ui";
import type { Serialized } from "@/shared/lib/serialize";
import type { NavigationType } from "@/shared/lib/validations/enums/prisma-types";
import type { NavigationItemData, SocialLinkData } from "./types";
import { flattenNavItems } from "./types";
import { useNavigationHandlers } from "./hooks/use-navigation-handlers";
import { NavigationList, SocialLinkList } from "./NavigationList";
import { NavigationFormDialog, SocialLinkFormDialog } from "./NavigationDialog";

// =============================================================================
// Props
// =============================================================================

type NavigationManagerProps = {
  initialDesktopItems: NavigationItemData[];
  initialMobileItems: NavigationItemData[];
  initialFooterItems: NavigationItemData[];
  initialSocialLinks: Serialized<SocialLinkData>[];
};

// =============================================================================
// Component
// =============================================================================

export function NavigationManager({
  initialDesktopItems,
  initialMobileItems,
  initialFooterItems,
  initialSocialLinks,
}: NavigationManagerProps) {
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
  const [navDefaultType, setNavDefaultType] =
    useState<NavigationType>("HEADER_DESKTOP");

  // Social Links State
  const [socialLinks, setSocialLinks] =
    useState<Serialized<SocialLinkData>[]>(initialSocialLinks);
  const [isSocialDialogOpen, setIsSocialDialogOpen] = useState(false);
  const [editingSocialLink, setEditingSocialLink] =
    useState<Serialized<SocialLinkData> | null>(null);

  // D&D Drag-to-nest State
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const [overItemId, setOverItemId] = useState<string | null>(null);
  const [activeSocialId, setActiveSocialId] = useState<string | null>(null);

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

  // Handlers (D&D + delete only; form は Dialog 内 useActionState で完結)
  const {
    isPending,
    loadData,
    getParentOptions,
    handleNavDelete,
    handleNavActiveToggle,
    handleNavDragStart,
    handleNavDragMove,
    handleNavDragOver,
    handleNavDragEnd,
    handleMakeChild,
    handleMakeRoot,
    handleSocialDelete,
    handleSocialActiveToggle,
    handleSocialDesktopToggle,
    handleSocialMobileToggle,
    handleSocialDragStart,
    handleSocialDragEnd,
  } = useNavigationHandlers(
    {
      desktopItems,
      mobileItems,
      footerItems,
      socialLinks,
      dragOffsetX,
      activeItemId,
      overItemId,
      activeSocialId,
    },
    {
      setDesktopItems,
      setMobileItems,
      setFooterItems,
      setSocialLinks,
      setDragOffsetX,
      setActiveItemId,
      setOverItemId,
      setActiveSocialId,
    },
  );

  // Dialog open helpers (mount-on-open + state init only)
  const openNavCreateDialog = (type: NavigationType) => {
    setEditingNavItem(null);
    setNavDefaultType(type);
    setIsNavDialogOpen(true);
  };
  const openNavEditDialog = (item: NavigationItemData) => {
    setEditingNavItem(item);
    setNavDefaultType(item.type);
    setIsNavDialogOpen(true);
  };
  const openSocialCreateDialog = () => {
    setEditingSocialLink(null);
    setIsSocialDialogOpen(true);
  };
  const openSocialEditDialog = (link: Serialized<SocialLinkData>) => {
    setEditingSocialLink(link);
    setIsSocialDialogOpen(true);
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
            overItemId={overItemId}
            dragOffsetX={dragOffsetX}
            onAdd={openNavCreateDialog}
            onEdit={openNavEditDialog}
            onDelete={handleNavDelete}
            onToggleActive={handleNavActiveToggle("HEADER_DESKTOP")}
            onDragStart={handleNavDragStart("HEADER_DESKTOP")}
            onDragMove={handleNavDragMove("HEADER_DESKTOP")}
            onDragOver={handleNavDragOver("HEADER_DESKTOP")}
            onDragEnd={handleNavDragEnd("HEADER_DESKTOP")}
            onMakeChild={handleMakeChild("HEADER_DESKTOP")}
            onMakeRoot={handleMakeRoot("HEADER_DESKTOP")}
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
            overItemId={overItemId}
            dragOffsetX={dragOffsetX}
            onAdd={openNavCreateDialog}
            onEdit={openNavEditDialog}
            onDelete={handleNavDelete}
            onToggleActive={handleNavActiveToggle("HEADER_MOBILE")}
            onDragStart={handleNavDragStart("HEADER_MOBILE")}
            onDragMove={handleNavDragMove("HEADER_MOBILE")}
            onDragOver={handleNavDragOver("HEADER_MOBILE")}
            onDragEnd={handleNavDragEnd("HEADER_MOBILE")}
            onMakeChild={handleMakeChild("HEADER_MOBILE")}
            onMakeRoot={handleMakeRoot("HEADER_MOBILE")}
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
            overItemId={overItemId}
            dragOffsetX={dragOffsetX}
            onAdd={openNavCreateDialog}
            onEdit={openNavEditDialog}
            onDelete={handleNavDelete}
            onToggleActive={handleNavActiveToggle("FOOTER")}
            onDragStart={handleNavDragStart("FOOTER")}
            onDragMove={handleNavDragMove("FOOTER")}
            onDragOver={handleNavDragOver("FOOTER")}
            onDragEnd={handleNavDragEnd("FOOTER")}
            onMakeChild={handleMakeChild("FOOTER")}
            onMakeRoot={handleMakeRoot("FOOTER")}
          />
        </TabsContent>

        <TabsContent value="social" className="mt-6">
          <SocialLinkList
            links={socialLinks}
            sensors={sensors}
            isPending={isPending}
            activeSocialId={activeSocialId}
            onAdd={openSocialCreateDialog}
            onEdit={openSocialEditDialog}
            onDelete={handleSocialDelete}
            onToggleActive={handleSocialActiveToggle}
            onToggleDesktop={handleSocialDesktopToggle}
            onToggleMobile={handleSocialMobileToggle}
            onDragStart={handleSocialDragStart}
            onDragEnd={handleSocialDragEnd}
          />
        </TabsContent>
      </Tabs>

      {/* mount-on-open: Dialog 内 conform `useForm` の defaultValue を確実に反映 */}
      {isNavDialogOpen && (
        <NavigationFormDialog
          open={isNavDialogOpen}
          onOpenChange={setIsNavDialogOpen}
          editingItem={editingNavItem}
          defaultType={navDefaultType}
          parentOptions={getParentOptions(navDefaultType)}
          onSuccess={loadData}
        />
      )}

      {isSocialDialogOpen && (
        <SocialLinkFormDialog
          open={isSocialDialogOpen}
          onOpenChange={setIsSocialDialogOpen}
          editingLink={editingSocialLink}
          onSuccess={loadData}
        />
      )}
    </div>
  );
}
