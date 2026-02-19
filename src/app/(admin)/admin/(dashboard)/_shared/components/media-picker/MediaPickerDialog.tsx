"use client";

/**
 * MediaPickerDialog
 *
 * メディアピッカーのメインダイアログ
 */

import { useState, type ReactNode } from "react";
import { X, Image as ImageIcon, Link, Upload } from "lucide-react";
import { useMediaSelection } from "@/admin/hooks/use-media-selection";
import { LibraryTab, UrlTab, UploadTab } from "./tabs";
import { Button } from "@/admin/components/ui";
import type { MediaData } from "@/admin/types/media-picker";
import type { UploadResult } from "@/admin/hooks/use-media-upload";
import type { MediaUsage } from "@/admin/lib/validations/media";
import type {
  SelectionMode,
  SelectedMedia,
  MediaPickerTab,
} from "@/admin/types/media-picker";
import { cn } from "@/shared/lib/utils";
import { Z_INDEX } from "@/admin/lib/styles/z-index";

export interface MediaPickerDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (media: SelectedMedia[]) => void;
  selectionMode: SelectionMode;
  maxSelections?: number;
  defaultUsage?: MediaUsage;
  initialSelected?: SelectedMedia[];
  showUrlTab?: boolean;
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
      onSelect([{ id: null, url, alt, source: "url" }]);
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

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 flex items-center justify-center bg-overlay p-4"
      style={{ zIndex: Z_INDEX.dialog }}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-4xl flex-col overflow-hidden rounded-lg bg-background shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b p-4">
          <h2 className="text-lg font-semibold">メディアを選択</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 hover:bg-muted"
            aria-label="閉じる"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex shrink-0 border-b px-4">
          <TabButton
            active={activeTab === "library"}
            onClick={() => setActiveTab("library")}
            icon={<ImageIcon className="mr-1 h-4 w-4" />}
            label="ライブラリ"
          />
          {showUrlTab && (
            <TabButton
              active={activeTab === "url"}
              onClick={() => setActiveTab("url")}
              icon={<Link className="mr-1 h-4 w-4" />}
              label="URL入力"
            />
          )}
          <TabButton
            active={activeTab === "upload"}
            onClick={() => setActiveTab("upload")}
            icon={<Upload className="mr-1 h-4 w-4" />}
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
            />
          )}
          {activeTab === "url" && showUrlTab && (
            <UrlTab onAdd={handleUrlAdd} canAddMore={canSelectMore} />
          )}
          {activeTab === "upload" && (
            <UploadTab
              onUploadComplete={handleUploadComplete}
              usage={defaultUsage}
              canAddMore={canSelectMore}
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
      </div>
    </div>
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
