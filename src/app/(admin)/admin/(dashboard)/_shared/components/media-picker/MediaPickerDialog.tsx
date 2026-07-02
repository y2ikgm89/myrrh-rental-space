"use client";

/**
 * MediaPickerDialog
 *
 * メディアピッカーのメインダイアログ
 */

import { useState, type ReactNode } from "react";
import { IconPhoto, IconLink, IconUpload } from "@tabler/icons-react";
import { useMediaSelection } from "@/admin/hooks/use-media-selection";
import { LibraryTab, UrlTab, UploadTab } from "./tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Button,
} from "@/admin/components/ui";
import type { MediaData } from "@/admin/types/media-picker";
import type { UploadResult } from "@/admin/hooks/use-media-upload";
import type { MediaUsage } from "@/admin/lib/validations/media";
import type {
  SelectionMode,
  SelectedMedia,
  MediaPickerTab,
} from "@/admin/types/media-picker";
import type { MediaAcceptType } from "@/shared/lib/sections/types";
import { cn } from "@/shared/lib/cn";

export interface MediaPickerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (media: SelectedMedia[]) => void;
  selectionMode: SelectionMode;
  maxSelections?: number;
  defaultUsage?: MediaUsage;
  initialSelected?: SelectedMedia[];
  showUrlTab?: boolean;
  /** 許容するメディアカテゴリ */
  accept: MediaAcceptType;
}

export function MediaPickerDialog({
  isOpen,
  onClose,
  onSelect,
  selectionMode,
  maxSelections = 10,
  defaultUsage = "GENERAL",
  initialSelected = [],
  showUrlTab = true,
  accept,
}: MediaPickerDialogProps) {
  const [activeTab, setActiveTab] = useState<MediaPickerTab>("library");

  const {
    selectedIds,
    selectedMedia,
    toggleSelection,
    addUrlMedia,
    addUploadedMedia,
    canSelectMore,
  } = useMediaSelection({
    mode: selectionMode,
    maxSelections,
    initialSelected,
  });

  const handleLibrarySelect = (media: MediaData) => {
    toggleSelection(media);
  };

  const handleUrlAdd = (url: string, alt?: string) => {
    addUrlMedia(url, alt);
    if (selectionMode === "single") {
      onSelect([
        { id: null, url, ...(alt !== undefined && { alt }), source: "url" },
      ]);
      onClose();
    }
  };

  const handleUploadComplete = (media: UploadResult) => {
    addUploadedMedia(media);
    if (selectionMode === "single") {
      onSelect([
        {
          id: media.id,
          url: media.url,
          ...(media.mimeType !== undefined && { mimeType: media.mimeType }),
          ...(media.size !== undefined && { size: media.size }),
          source: "upload",
        },
      ]);
      onClose();
    }
  };

  const handleConfirm = () => {
    if (selectedMedia.length > 0) {
      onSelect(selectedMedia);
    }
    onClose();
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-4xl max-h-[var(--modal-max-height-lg)] flex flex-col gap-0 p-0 overflow-hidden">
        {/* Header - pr-12 でDialogContent内蔵の X ボタンとの重複を防ぐ */}
        <DialogHeader className="shrink-0 border-b p-4 pr-12">
          <DialogTitle>メディアを選択</DialogTitle>
          <DialogDescription className="sr-only">
            メディアライブラリから対象のメディアを検索して選択するか、新しいメディアをアップロードします。
          </DialogDescription>
        </DialogHeader>

        {/* Tabs */}
        <div className="flex shrink-0 border-b px-4">
          <TabButton
            active={activeTab === "library"}
            onClick={() => setActiveTab("library")}
            icon={<IconPhoto className="mr-1 h-4 w-4" />}
            label="ライブラリ"
          />
          {showUrlTab && (
            <TabButton
              active={activeTab === "url"}
              onClick={() => setActiveTab("url")}
              icon={<IconLink className="mr-1 h-4 w-4" />}
              label="URL入力"
            />
          )}
          <TabButton
            active={activeTab === "upload"}
            onClick={() => setActiveTab("upload")}
            icon={<IconUpload className="mr-1 h-4 w-4" />}
            label="アップロード"
          />
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === "library" && (
            <LibraryTab
              selectedIds={selectedIds}
              onSelect={handleLibrarySelect}
              canSelectMore={canSelectMore}
              accept={accept}
            />
          )}
          {activeTab === "url" && showUrlTab && (
            <UrlTab
              onAdd={handleUrlAdd}
              canAddMore={canSelectMore}
              accept={accept}
            />
          )}
          {activeTab === "upload" && (
            <UploadTab
              onUploadComplete={handleUploadComplete}
              usage={defaultUsage}
              canAddMore={canSelectMore}
              accept={accept}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between border-t p-4">
          <div className="text-sm text-muted-foreground">
            {selectionMode === "multiple" && (
              <>
                {selectedMedia.length} / {maxSelections} 件選択中
              </>
            )}
            {selectionMode === "single" && selectedMedia.length > 0 && (
              <>1件選択中</>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>
              キャンセル
            </Button>
            {selectionMode === "multiple" && (
              <Button
                onClick={handleConfirm}
                disabled={selectedMedia.length === 0}
              >
                挿入（{selectedMedia.length}件）
              </Button>
            )}
            {selectionMode === "single" && activeTab === "library" && (
              <Button
                onClick={handleConfirm}
                disabled={selectedMedia.length === 0}
              >
                挿入
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}

function TabButton({ active, onClick, icon, label }: TabButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors",
        active
          ? "border-primary text-primary"
          : "border-transparent text-muted-foreground hover:text-foreground",
      )}
    >
      <span className="flex items-center">
        {icon}
        {label}
      </span>
    </button>
  );
}
