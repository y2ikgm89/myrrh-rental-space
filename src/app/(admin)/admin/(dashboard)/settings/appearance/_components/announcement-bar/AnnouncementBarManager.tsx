"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/admin/components/ui";
import { fetchAdminJson } from "@/admin/lib/admin-api-client";
import {
  deleteAnnouncementBar,
  updateAnnouncementBarActive,
} from "@/admin/actions/announcement-bar";
import type { AnnouncementBarData } from "@/shared/domain/settings/announcement-bar";
import type { Serialized } from "@/shared/lib/serialize";
import {
  updateAnnouncementBarCarouselSettings,
  type AnnouncementBarCarouselSettingsInput,
} from "@/admin/actions/settings";
import {
  validateAnimation,
  validateDesignStyle,
} from "@/shared/lib/announcement-bar-utils";
import {
  AnnouncementBarAnimation,
  AnnouncementBarDesignStyle,
} from "@/shared/lib/validations/enums/prisma-types";
import { isMutationError } from "@/shared/lib/mutation-result";
import { BarList } from "./BarList";
import { BarFormDialog, DeleteDialog } from "./BarDialog";
import { CarouselSettingsPanel } from "./CarouselSettings";
import { isValidHexColor, type CarouselSettings } from "./types";

// =============================================================================
// Props
// =============================================================================

type AnnouncementBarManagerProps = {
  initialBars: Serialized<AnnouncementBarData>[];
  initialCarouselSettings: AnnouncementBarCarouselSettingsInput;
};

async function fetchAnnouncementBars(): Promise<{
  items: Serialized<AnnouncementBarData>[];
  total: number;
}> {
  return fetchAdminJson("/admin/api/announcement-bars");
}

// =============================================================================
// Main Component
// =============================================================================

export function AnnouncementBarManager({
  initialBars,
  initialCarouselSettings,
}: AnnouncementBarManagerProps) {
  const [isPending, startTransition] = useTransition();
  const [bars, setBars] =
    useState<Serialized<AnnouncementBarData>[]>(initialBars);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingBar, setEditingBar] =
    useState<Serialized<AnnouncementBarData> | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // カルーセル設定のステート
  const [carouselSettings, setCarouselSettings] = useState<CarouselSettings>(
    () => ({
      announcementBarAnimation: validateAnimation(
        initialCarouselSettings.announcementBarAnimation ??
          AnnouncementBarAnimation.fade,
      ),
      announcementBarDuration: initialCarouselSettings.announcementBarDuration,
      announcementBarAutoPlay: initialCarouselSettings.announcementBarAutoPlay,
      announcementBarPauseOnHover:
        initialCarouselSettings.announcementBarPauseOnHover,
      announcementBarShowArrows:
        initialCarouselSettings.announcementBarShowArrows,
      announcementBarShowIndicator:
        initialCarouselSettings.announcementBarShowIndicator,
      announcementBarDesignStyle: validateDesignStyle(
        initialCarouselSettings.announcementBarDesignStyle ??
          AnnouncementBarDesignStyle.solid,
      ),
      announcementBarBgColor:
        initialCarouselSettings.announcementBarBgColor || "",
      announcementBarTextColor:
        initialCarouselSettings.announcementBarTextColor || "",
      announcementBarStripeColor:
        initialCarouselSettings.announcementBarStripeColor || "",
      announcementBarStripeAnimation:
        initialCarouselSettings.announcementBarStripeAnimation,
      announcementBarGradientAnimation:
        initialCarouselSettings.announcementBarGradientAnimation,
      announcementBarGlassAnimation:
        initialCarouselSettings.announcementBarGlassAnimation,
      announcementBarSticky:
        initialCarouselSettings.announcementBarSticky ?? false,
    }),
  );

  const loadBars = async () => {
    const result = await fetchAnnouncementBars();
    setBars(result.items);
  };

  // Open dialog for create/edit (mount-on-open + Variant A: form は Dialog 内で独立 init)
  const openDialog = (bar?: Serialized<AnnouncementBarData>) => {
    setEditingBar(bar ?? null);
    setIsDialogOpen(true);
  };

  // Toggle active
  const handleToggleActive = (id: string, isActive: boolean) => {
    startTransition(async () => {
      const result = await updateAnnouncementBarActive(id, isActive);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      loadBars();
    });
  };

  // Delete
  const handleDelete = () => {
    if (!deletingId) return;

    startTransition(async () => {
      const result = await deleteAnnouncementBar(deletingId);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success("お知らせバーを削除しました");
      setDeleteDialogOpen(false);
      setDeletingId(null);
      loadBars();
    });
  };

  // Save carousel settings
  const handleSaveCarouselSettings = () => {
    const colorFields = [
      { name: "背景色", value: carouselSettings.announcementBarBgColor },
      { name: "文字色", value: carouselSettings.announcementBarTextColor },
      {
        name: "ストライプ色",
        value: carouselSettings.announcementBarStripeColor,
      },
    ];
    for (const field of colorFields) {
      if (field.value && !isValidHexColor(field.value)) {
        toast.error(
          `${field.name}は#RRGGBB形式で入力してください（例: #2563eb）`,
        );
        return;
      }
    }

    startTransition(async () => {
      const result = await updateAnnouncementBarCarouselSettings({
        announcementBarAnimation: carouselSettings.announcementBarAnimation,
        announcementBarDuration: carouselSettings.announcementBarDuration,
        announcementBarAutoPlay: carouselSettings.announcementBarAutoPlay,
        announcementBarPauseOnHover:
          carouselSettings.announcementBarPauseOnHover,
        announcementBarShowArrows: carouselSettings.announcementBarShowArrows,
        announcementBarShowIndicator:
          carouselSettings.announcementBarShowIndicator,
        announcementBarDesignStyle: carouselSettings.announcementBarDesignStyle,
        announcementBarBgColor: carouselSettings.announcementBarBgColor || null,
        announcementBarTextColor:
          carouselSettings.announcementBarTextColor || null,
        announcementBarStripeColor:
          carouselSettings.announcementBarStripeColor || null,
        announcementBarStripeAnimation:
          carouselSettings.announcementBarStripeAnimation,
        announcementBarGradientAnimation:
          carouselSettings.announcementBarGradientAnimation,
        announcementBarGlassAnimation:
          carouselSettings.announcementBarGlassAnimation,
        announcementBarSticky: carouselSettings.announcementBarSticky,
      });
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success("デザイン・カルーセル設定を保存しました");
    });
  };

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
              setDeletingId(id);
              setDeleteDialogOpen(true);
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

      {/* mount-on-open: Dialog 内 conform `useForm` の defaultValue を確実に反映 */}
      {isDialogOpen && (
        <BarFormDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          editingBar={editingBar}
          onSuccess={loadBars}
        />
      )}

      <DeleteDialog
        isOpen={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        isPending={isPending}
        onConfirm={handleDelete}
      />
    </div>
  );
}
