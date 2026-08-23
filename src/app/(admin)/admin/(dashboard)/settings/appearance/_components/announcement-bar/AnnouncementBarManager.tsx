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
import { announcementBarsListResponseSchema } from "@/admin/lib/admin-api-response-schemas";
import {
  deleteAnnouncementBar,
  reorderAnnouncementBars,
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
import {
  fromCarouselFormValues,
  toCarouselFormValues,
} from "@/shared/lib/validations/announcement-bar";
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
  readOnly?: boolean;
};

async function fetchAnnouncementBars(): Promise<{
  items: Serialized<AnnouncementBarData>[];
  total: number;
}> {
  return fetchAdminJson(
    "/admin/api/announcement-bars",
    announcementBarsListResponseSchema,
  );
}

// =============================================================================
// Main Component
// =============================================================================

export function AnnouncementBarManager({
  initialBars,
  initialCarouselSettings,
  readOnly = false,
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
  // 14 キーの書き写しをやめる（監査 A-18）。保存値↔フォーム値の差分は
  // 色 3 キーの null / 空文字だけで、それは変換関数側に閉じてある。
  // enum の妥当性確認だけはここに残す（DB に旧値が残っている場合の防御）。
  const [carouselSettings, setCarouselSettings] = useState<CarouselSettings>(
    () =>
      toCarouselFormValues({
        ...initialCarouselSettings,
        announcementBarAnimation: validateAnimation(
          initialCarouselSettings.announcementBarAnimation ??
            AnnouncementBarAnimation.FADE,
        ),
        announcementBarDesignStyle: validateDesignStyle(
          initialCarouselSettings.announcementBarDesignStyle ??
            AnnouncementBarDesignStyle.SOLID,
        ),
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

      await loadBars();
    });
  };

  const handleReorder = (reorderedBars: Serialized<AnnouncementBarData>[]) => {
    const previousBars = bars;
    setBars(reorderedBars);

    startTransition(async () => {
      const result = await reorderAnnouncementBars(
        reorderedBars.map((bar) => bar.id),
      );
      if (isMutationError(result)) {
        toast.error(result.error);
        setBars(previousBars);
        return;
      }

      toast.success("お知らせバーの表示順を更新しました");
      await loadBars();
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
      await loadBars();
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
      const result = await updateAnnouncementBarCarouselSettings(
        fromCarouselFormValues(carouselSettings),
      );
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success("デザイン・カルーセル設定を保存しました");
    });
  };

  return (
    <fieldset
      disabled={readOnly}
      className="space-y-6 border-0 p-0 m-0 min-w-0"
    >
      <div className="space-y-6">
        <Tabs defaultValue="bars" className="space-y-4">
          <TabsList>
            <TabsTrigger value="bars">お知らせ一覧</TabsTrigger>
            <TabsTrigger value="design">デザイン・カルーセル設定</TabsTrigger>
          </TabsList>

          <TabsContent value="bars">
            <BarList
              bars={bars}
              isPending={isPending || readOnly}
              onEdit={openDialog}
              onCreate={() => openDialog()}
              onToggleActive={handleToggleActive}
              onReorder={handleReorder}
              onDelete={(id) => {
                setDeletingId(id);
                setDeleteDialogOpen(true);
              }}
            />
          </TabsContent>

          <TabsContent value="design">
            <CarouselSettingsPanel
              settings={carouselSettings}
              isPending={isPending || readOnly}
              onSettingsChange={setCarouselSettings}
              onSave={handleSaveCarouselSettings}
            />
          </TabsContent>
        </Tabs>

        {/* mount-on-open: Dialog 内 conform `useForm` の defaultValue を確実に反映 */}
        {isDialogOpen && !readOnly ? (
          <BarFormDialog
            open={isDialogOpen}
            onOpenChange={setIsDialogOpen}
            editingBar={editingBar}
            onSuccess={loadBars}
          />
        ) : null}

        {!readOnly ? (
          <DeleteDialog
            isOpen={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            isPending={isPending}
            onConfirm={handleDelete}
          />
        ) : null}
      </div>
    </fieldset>
  );
}
