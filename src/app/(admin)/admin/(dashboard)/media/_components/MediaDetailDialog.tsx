"use client";

/**
 * メディア詳細ダイアログ
 */

import { useState, useTransition, useRef, useId } from "react";
import {
  IconCopy,
  IconExternalLink,
  IconTrash,
  IconDeviceFloppy,
  IconLoader2,
  IconFileText,
  IconMovie,
  IconFile,
} from "@tabler/icons-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { useConfirm } from "@/admin/contexts/confirm-context";
import { updateMedia, deleteMedia } from "@/admin/actions/media";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { MediaData } from "@/admin/types/media-picker";
import { formatDate } from "@/shared/lib/date-format";
import { formatBytes } from "@/admin/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Button,
} from "@/admin/components/ui";
import { USAGE_OPTIONS } from "./constants";
import { isValidMediaUsage } from "@/admin/lib/validations/media";

type Props = {
  item: MediaData | null;
  onClose: () => void;
};

type FormState = {
  alt: string;
  title: string;
  description: string;
  usage: string;
};

function getInitialFormState(item: MediaData | null): FormState {
  return {
    alt: item?.alt || "",
    title: item?.title || "",
    description: item?.description || "",
    usage: item?.usage || "GENERAL",
  };
}

export function MediaDetailDialog({ item, onClose }: Props) {
  const router = useRouter();
  const confirmDialog = useConfirm();
  const formId = useId();
  const [isPending, startTransition] = useTransition();
  const [hasChanges, setHasChanges] = useState(false);

  // Track which item the form state is for (derived state pattern)
  const lastItemIdRef = useRef<string | null>(null);
  const currentItemId = item?.id ?? null;

  const [formData, setFormData] = useState<FormState>(() =>
    getInitialFormState(item),
  );

  // Derived state: reset form when item changes (React official pattern for adjusting state on prop change)
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  if (currentItemId !== lastItemIdRef.current) {
    lastItemIdRef.current = currentItemId;
    setFormData(getInitialFormState(item));
    setHasChanges(false);
  }

  const handleChange = (field: keyof FormState, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    setHasChanges(true);
  };

  const handleCopyUrl = async () => {
    if (!item) return;
    await navigator.clipboard.writeText(item.url);
    toast.success("URLをコピーしました");
  };

  const handleSave = () => {
    if (!item) return;
    const usage = formData.usage;
    if (!isValidMediaUsage(usage)) {
      toast.error("無効な用途が選択されています");
      return;
    }

    startTransition(async () => {
      const result = await updateMedia(item.id, {
        alt: formData.alt || undefined,
        title: formData.title || undefined,
        description: formData.description || undefined,
        usage,
      });

      if (!isMutationError(result)) {
        toast.success("更新しました");
        setHasChanges(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleDelete = async () => {
    if (!item) return;
    const confirmed = await confirmDialog({
      title: "メディアを削除しますか？",
      description: `「${item.filename}」を削除します。この操作は元に戻せません。`,
      confirmLabel: "削除",
      variant: "destructive",
    });
    if (!confirmed) return;

    startTransition(async () => {
      const result = await deleteMedia(item.id);
      if (!isMutationError(result)) {
        toast.success("削除しました");
        onClose();
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <Dialog
      open={!!item}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-hidden flex flex-col gap-0 p-0">
        {item && (
          <>
            <DialogHeader className="px-4 pt-4 pb-4 shrink-0 border-b">
              <DialogTitle className="truncate pr-8">
                {item.filename}
              </DialogTitle>
            </DialogHeader>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="grid md:grid-cols-2 gap-6">
                {/* Preview */}
                <div>
                  <MediaPreview item={item} />

                  {/* Actions */}
                  <div className="flex gap-2 mt-3">
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      onClick={handleCopyUrl}
                    >
                      <IconCopy className="h-4 w-4 mr-1" />
                      URLをコピー
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1"
                      asChild
                    >
                      <a
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <IconExternalLink className="h-4 w-4 mr-1" />
                        開く
                      </a>
                    </Button>
                  </div>
                </div>

                {/* Info & IconEdit Form */}
                <div className="space-y-4">
                  {/* File Info */}
                  <div className="space-y-2 text-sm">
                    <InfoRow
                      label="ファイルサイズ"
                      value={formatBytes(item.size)}
                    />
                    <InfoRow label="種別" value={item.mimeType} />
                    {item.width && item.height && (
                      <InfoRow
                        label="サイズ"
                        value={`${item.width} x ${item.height} px`}
                      />
                    )}
                    <InfoRow
                      label="アップロード"
                      value={formatDate(item.createdAt)}
                    />
                    <InfoRow
                      label="アップロード者"
                      value={item.uploader?.name ?? "削除済みユーザー"}
                    />
                  </div>

                  <hr />

                  {/* Edit Form */}
                  <div className="space-y-3">
                    {/* Usage */}
                    <div>
                      <label
                        htmlFor={`${formId}-usage`}
                        className="text-sm font-medium block mb-1"
                      >
                        用途
                      </label>
                      <select
                        id={`${formId}-usage`}
                        value={formData.usage}
                        onChange={(e) => handleChange("usage", e.target.value)}
                        className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                      >
                        {USAGE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Alt */}
                    {item.type === "IMAGE" && (
                      <div>
                        <label
                          htmlFor={`${formId}-alt`}
                          className="text-sm font-medium block mb-1"
                        >
                          代替テキスト（alt）
                        </label>
                        <input
                          id={`${formId}-alt`}
                          type="text"
                          value={formData.alt}
                          onChange={(e) => handleChange("alt", e.target.value)}
                          className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                          placeholder="画像の説明"
                        />
                      </div>
                    )}

                    {/* Title */}
                    <div>
                      <label
                        htmlFor={`${formId}-title`}
                        className="text-sm font-medium block mb-1"
                      >
                        タイトル
                      </label>
                      <input
                        id={`${formId}-title`}
                        type="text"
                        value={formData.title}
                        onChange={(e) => handleChange("title", e.target.value)}
                        className="w-full h-9 rounded-md border bg-background px-3 text-sm"
                        placeholder="管理用タイトル"
                      />
                    </div>

                    {/* Description */}
                    <div>
                      <label
                        htmlFor={`${formId}-description`}
                        className="text-sm font-medium block mb-1"
                      >
                        説明
                      </label>
                      <textarea
                        id={`${formId}-description`}
                        value={formData.description}
                        onChange={(e) =>
                          handleChange("description", e.target.value)
                        }
                        className="w-full rounded-md border bg-background px-3 py-2 text-sm resize-none"
                        rows={3}
                        placeholder="メモ・説明"
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-between p-4 border-t shrink-0">
              <Button
                variant="destructive"
                onClick={handleDelete}
                disabled={isPending}
              >
                <IconTrash className="h-4 w-4 mr-1" />
                削除
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={onClose}>
                  閉じる
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={!hasChanges || isPending}
                >
                  {isPending && (
                    <IconLoader2 className="h-4 w-4 mr-1 animate-spin" />
                  )}
                  <IconDeviceFloppy className="h-4 w-4 mr-1" />
                  保存
                </Button>
              </div>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function MediaPreview({ item }: { item: MediaData }) {
  return (
    <div className="rounded-lg overflow-hidden bg-muted aspect-square flex items-center justify-center">
      {item.type === "IMAGE" ? (
        <img
          src={item.url}
          alt={item.alt || item.filename}
          className="w-full h-full object-contain"
        />
      ) : item.type === "VIDEO" ? (
        <IconMovie className="h-24 w-24 text-muted-foreground" />
      ) : item.type === "DOCUMENT" ? (
        <IconFileText className="h-24 w-24 text-muted-foreground" />
      ) : (
        <IconFile className="h-24 w-24 text-muted-foreground" />
      )}
    </div>
  );
}
