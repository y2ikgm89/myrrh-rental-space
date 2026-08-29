"use client";

/**
 * MediaPickerDialog
 *
 * メディアピッカーのメインダイアログ
 */

import { useState, type ReactNode } from "react";
import { IconPhoto, IconLink, IconUpload } from "@tabler/icons-react";
import {
  uploadedMediaToSelectedMedia,
  useMediaSelection,
} from "@/admin/hooks/use-media-selection";
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
  showUrlTab = false,
  accept,
}: MediaPickerDialogProps) {
  const [activeTab, setActiveTab] = useState<MediaPickerTab>("library");

  const [wasOpen, setWasOpen] = useState(isOpen);
  const openNow = isOpen;
  if (openNow !== wasOpen) {
    setWasOpen(openNow);
    if (openNow) {
      setActiveTab("library");
    }
  }

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
    isOpen,
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
      onSelect([uploadedMediaToSelectedMedia(media)]);
      onClose();
    }
  };

  const handleConfirm = () => {
    if (selectedMedia.length > 0) {
      onSelect(selectedMedia);
    }
    onClose();
  };

  // Tab pattern keyboard navigation: ArrowLeft/Right でタブを巡回、Home/End で
  // 端に移動。tabpanel 側でのショートカット (Ctrl+PageUp/Down) は未対応
  // (WAI-ARIA APG では optional)。
  const handleTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const tabs: MediaPickerTab[] = ["library"];
    if (showUrlTab) tabs.push("url");
    tabs.push("upload");
    const currentIndex = tabs.indexOf(activeTab);
    if (currentIndex === -1) return;

    let nextIndex: number | null = null;
    switch (event.key) {
      case "ArrowLeft":
        nextIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1;
        break;
      case "ArrowRight":
        nextIndex = currentIndex === tabs.length - 1 ? 0 : currentIndex + 1;
        break;
      case "Home":
        nextIndex = 0;
        break;
      case "End":
        nextIndex = tabs.length - 1;
        break;
      default:
        return;
    }
    if (nextIndex === null) return;
    event.preventDefault();
    const nextTab = tabs[nextIndex];
    if (nextTab !== undefined) setActiveTab(nextTab);
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

        {/*
          Tabs — WAI-ARIA Authoring Practices tab pattern の最小実装:
          - role="tablist" + orientation="horizontal"
          - 各 button: role="tab" + aria-selected + aria-controls + id + tabIndex
          - 対応 content: role="tabpanel" + aria-labelledby + id + tabIndex={0}
          - ArrowLeft/ArrowRight/Home/End で tab を巡回 (activeTab を変える)
          - selected tab のみが tab-order に載る (roving tabIndex)
        */}
        <div
          role="tablist"
          aria-label="メディアソース"
          aria-orientation="horizontal"
          onKeyDown={handleTabKeyDown}
          className="flex shrink-0 border-b px-4"
        >
          <TabButton
            active={activeTab === "library"}
            onClick={() => setActiveTab("library")}
            id="media-picker-tab-library"
            controlsId="media-picker-panel-library"
            icon={<IconPhoto className="mr-1 h-4 w-4" />}
            label="ライブラリ"
          />
          {showUrlTab && (
            <TabButton
              active={activeTab === "url"}
              onClick={() => setActiveTab("url")}
              id="media-picker-tab-url"
              controlsId="media-picker-panel-url"
              icon={<IconLink className="mr-1 h-4 w-4" />}
              label="URL入力"
            />
          )}
          <TabButton
            active={activeTab === "upload"}
            onClick={() => setActiveTab("upload")}
            id="media-picker-tab-upload"
            controlsId="media-picker-panel-upload"
            icon={<IconUpload className="mr-1 h-4 w-4" />}
            label="アップロード"
          />
        </div>

        {/* Content — 各 panel は自分の tab の id を aria-labelledby で参照する */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === "library" && (
            <div
              role="tabpanel"
              id="media-picker-panel-library"
              aria-labelledby="media-picker-tab-library"
              tabIndex={0}
            >
              <LibraryTab
                selectedIds={selectedIds}
                onSelect={handleLibrarySelect}
                canSelectMore={canSelectMore}
                accept={accept}
              />
            </div>
          )}
          {activeTab === "url" && showUrlTab && (
            <div
              role="tabpanel"
              id="media-picker-panel-url"
              aria-labelledby="media-picker-tab-url"
              tabIndex={0}
            >
              <UrlTab
                onAdd={handleUrlAdd}
                canAddMore={canSelectMore}
                accept={accept}
              />
            </div>
          )}
          {activeTab === "upload" && (
            <div
              role="tabpanel"
              id="media-picker-panel-upload"
              aria-labelledby="media-picker-tab-upload"
              tabIndex={0}
            >
              <UploadTab
                onUploadComplete={handleUploadComplete}
                usage={defaultUsage}
                canAddMore={canSelectMore}
                accept={accept}
              />
            </div>
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
  /** tabpanel から aria-labelledby で参照される。 */
  id: string;
  /** 対応する tabpanel の id (aria-controls)。 */
  controlsId: string;
}

function TabButton({
  active,
  onClick,
  icon,
  label,
  id,
  controlsId,
}: TabButtonProps) {
  return (
    <button
      type="button"
      role="tab"
      id={id}
      aria-controls={controlsId}
      aria-selected={active}
      tabIndex={active ? 0 : -1}
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
