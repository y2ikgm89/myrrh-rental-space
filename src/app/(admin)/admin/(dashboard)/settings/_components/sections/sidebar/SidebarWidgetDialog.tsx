"use client";

import { useState } from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  SubmitButton,
  Textarea,
} from "@/admin/components/ui";
import type { CustomWidget } from "@/shared/lib/validations/sidebar";

// =============================================================================
// Types
// =============================================================================

export interface CustomWidgetFormData {
  title: string;
  description: string;
  linkUrl: string;
  linkLabel: string;
}

const EMPTY_FORM: CustomWidgetFormData = {
  title: "",
  description: "",
  linkUrl: "",
  linkLabel: "",
};

// =============================================================================
// Props
// =============================================================================

export interface SidebarWidgetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editingWidget: CustomWidget | null;
  onSubmit: (data: CustomWidgetFormData) => void;
}

// =============================================================================
// Component
// =============================================================================

export function SidebarWidgetDialog({
  open,
  onOpenChange,
  editingWidget,
  onSubmit,
}: SidebarWidgetDialogProps) {
  const [form, setForm] = useState<CustomWidgetFormData>(() =>
    editingWidget
      ? {
          title: editingWidget.title,
          description: editingWidget.description ?? "",
          linkUrl: editingWidget.linkUrl ?? "",
          linkLabel: editingWidget.linkLabel ?? "",
        }
      : EMPTY_FORM,
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    onSubmit(form);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {editingWidget
              ? "カスタムウィジェットを編集"
              : "カスタムウィジェットを追加"}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="widget-title">
              タイトル <span className="text-destructive">*</span>
            </Label>
            <Input
              id="widget-title"
              value={form.title}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, title: e.target.value }))
              }
              placeholder="ウィジェットタイトル"
              required
              maxLength={100}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="widget-description">説明</Label>
            <Textarea
              id="widget-description"
              value={form.description}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  description: e.target.value,
                }))
              }
              placeholder="ウィジェットの説明（任意）"
              maxLength={500}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="widget-link-url">リンクURL</Label>
            <Input
              id="widget-link-url"
              value={form.linkUrl}
              onChange={(e) =>
                setForm((prev) => ({ ...prev, linkUrl: e.target.value }))
              }
              placeholder="https://..."
              maxLength={500}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="widget-link-label">リンクラベル</Label>
            <Input
              id="widget-link-label"
              value={form.linkLabel}
              onChange={(e) =>
                setForm((prev) => ({
                  ...prev,
                  linkLabel: e.target.value,
                }))
              }
              placeholder="もっと見る"
              maxLength={100}
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
            >
              キャンセル
            </Button>
            <SubmitButton
              isPending={false}
              disabled={!form.title.trim()}
              label={editingWidget ? "更新" : "追加"}
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
